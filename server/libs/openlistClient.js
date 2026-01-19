const axios = require('axios')
const Logger = require('../Logger')

/**
 * OpenList API 客户端
 * 用于与 OpenList/AList 服务器通信
 *
 * 环境变量：
 * - OPENLIST_URL: OpenList 服务器地址（如 http://localhost:5244）
 * - OPENLIST_TOKEN: API 访问令牌
 * - OPENLIST_TIMEOUT: API 超时时间（毫秒，默认 60000）
 * - OPENLIST_RETRIES: 重试次数（默认 3）
 * - OPENLIST_CONCURRENCY: 最大并发请求数（默认 2）
 * - OPENLIST_BATCH_SIZE: 音频文件扫描批次大小（默认 2）
 * - OPENLIST_BATCH_DELAY: 批次之间的延迟（毫秒，默认 500）
 * - OPENLIST_CACHE_EXPIRY: 缓存过期时间（毫秒，默认 300000）
 * - OPENLIST_USE_SIGNED_URL: 是否使用签名下载链接（默认 false，设为 true 则调用 API 获取签名链接）
 */
class OpenListClient {
  constructor() {
    this.baseURL = process.env.OPENLIST_URL
    this.token = process.env.OPENLIST_TOKEN
    this.enabled = !!(this.baseURL && this.token)

    // 可配置的超时和重试
    this.timeout = parseInt(process.env.OPENLIST_TIMEOUT) || 60000 // 默认 60 秒
    this.maxRetries = parseInt(process.env.OPENLIST_RETRIES) || 3 // 默认重试 3 次
    this.maxConcurrency = parseInt(process.env.OPENLIST_CONCURRENCY) || 2 // 默认最大 2 个并发请求

    // 请求队列状态
    this.activeRequests = 0
    this.requestQueue = []

    // 文件信息缓存（避免重复 API 调用）
    // key: 文件路径, value: 文件信息对象
    this.fileInfoCache = new Map()
    // 缓存过期时间（毫秒），默认 5 分钟
    this.cacheExpiry = parseInt(process.env.OPENLIST_CACHE_EXPIRY) || 300000

    if (this.enabled) {
      Logger.info(`[OpenList] Client initialized with URL: ${this.baseURL}`)
      Logger.info(`[OpenList] Timeout: ${this.timeout}ms, Retries: ${this.maxRetries}, Concurrency: ${this.maxConcurrency}`)

      // 确定 Token 格式
      // 根据 OpenList/AList API 文档，Token 应该直接放在 Authorization header 中
      // 不需要 Bearer 前缀
      // Token 格式: openlist-{uuid}{random_string}
      const authHeader = this.token

      Logger.debug(`[OpenList] Token format: ${authHeader.substring(0, 20)}...`)

      // 创建 axios 实例
      this.client = axios.create({
        baseURL: this.baseURL,
        timeout: this.timeout,
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        }
      })

      // 添加响应拦截器用于错误处理
      this.client.interceptors.response.use(
        (response) => response,
        (error) => {
          // 超时错误不打印详细日志，会在重试逻辑中处理
          if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            Logger.debug('[OpenList] Request timeout, may retry...')
          } else {
            Logger.error('[OpenList] API request failed:', error.message)
            if (error.response) {
              Logger.error('[OpenList] Response status:', error.response.status)
              Logger.error('[OpenList] Response data:', JSON.stringify(error.response.data))
              if (error.response.status === 401) {
                Logger.error('[OpenList] Authentication failed (401 Unauthorized)')
                Logger.error('[OpenList] Current token format:', this.token.substring(0, 20) + '...')
                Logger.error('[OpenList] Please verify:')
                Logger.error('[OpenList]   1. Token is correct and not expired')
                Logger.error('[OpenList]   2. Token was copied completely from: Settings -> Other -> Token')
                Logger.error('[OpenList]   3. Token format should be: openlist-{uuid}{random_string}')
                Logger.error('[OpenList]   4. Try regenerating the token in OpenList admin panel')
              }
            }
          }
          throw error
        }
      )
    } else {
      Logger.warn('[OpenList] Client not configured. Set OPENLIST_URL and OPENLIST_TOKEN environment variables.')
    }
  }

  /**
   * 检查客户端是否已配置
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled
  }

  /**
   * 带重试的请求方法
   * @param {Function} requestFn - 请求函数
   * @param {string} operationName - 操作名称（用于日志）
   * @returns {Promise<any>}
   */
  async requestWithRetry(requestFn, operationName) {
    // 等待并发槽位
    await this.waitForSlot()

    let lastError = null

    try {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          return await requestFn()
        } catch (error) {
          lastError = error
          const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout')

          if (isTimeout && attempt < this.maxRetries) {
            Logger.warn(`[OpenList] ${operationName} timeout (attempt ${attempt}/${this.maxRetries}), retrying...`)
            // 指数退避：等待 1s, 2s, 4s...
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
          } else if (!isTimeout) {
            // 非超时错误，不重试
            throw error
          }
        }
      }

      // 所有重试都失败
      Logger.error(`[OpenList] ${operationName} failed after ${this.maxRetries} attempts`)
      throw lastError
    } finally {
      // 释放并发槽位
      this.releaseSlot()
    }
  }

  /**
   * 等待可用的并发槽位
   * @returns {Promise<void>}
   */
  async waitForSlot() {
    if (this.activeRequests < this.maxConcurrency) {
      this.activeRequests++
      return
    }

    // 等待槽位释放
    return new Promise((resolve) => {
      this.requestQueue.push(resolve)
    })
  }

  /**
   * 释放并发槽位
   */
  releaseSlot() {
    if (this.requestQueue.length > 0) {
      // 有等待的请求，唤醒一个
      const next = this.requestQueue.shift()
      next()
    } else {
      this.activeRequests--
    }
  }

  /**
   * 测试连接
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    if (!this.enabled) return false

    try {
      const response = await this.client.get('/ping')
      Logger.info('[OpenList] Connection test successful')
      return response.status === 200
    } catch (error) {
      Logger.error('[OpenList] Connection test failed:', error.message)
      return false
    }
  }

  /**
   * 获取站点设置
   * @returns {Promise<Object|null>}
   */
  async getSettings() {
    if (!this.enabled) return null

    try {
      const response = await this.client.get('/api/public/settings')
      if (response.data?.code === 200) {
        return response.data.data
      }
      return null
    } catch (error) {
      Logger.error('[OpenList] Failed to get settings:', error.message)
      return null
    }
  }

  /**
   * 列出目录内容
   * @param {string} path - 目录路径
   * @param {Object} options - 可选参数
   * @param {string} options.password - 目录密码
   * @param {number} options.page - 页码（从 1 开始）
   * @param {number} options.perPage - 每页数量（0 表示全部）
   * @param {boolean} options.refresh - 是否刷新缓存
   * @returns {Promise<Object|null>} { content: [], total: number, readme: string, write: boolean }
   */
  async listDirectory(path, options = {}) {
    if (!this.enabled) return null

    const { password = '', page = 1, perPage = 0, refresh = false } = options

    try {
      Logger.debug(`[OpenList] Listing directory: ${path}`)

      const response = await this.requestWithRetry(
        () =>
          this.client.post('/api/fs/list', {
            path,
            password,
            page,
            per_page: perPage,
            refresh
          }),
        `listDirectory(${path})`
      )

      if (response.data?.code === 200) {
        const data = response.data.data
        Logger.debug(`[OpenList] Found ${data.content?.length || 0} items in ${path}`)
        return data
      } else {
        Logger.error(`[OpenList] List directory failed with code ${response.data?.code}: ${response.data?.message}`)
        return null
      }
    } catch (error) {
      Logger.error(`[OpenList] Failed to list directory "${path}":`, error.message)
      return null
    }
  }

  /**
   * 获取文件/目录信息
   * @param {string} path - 文件或目录路径
   * @param {string} password - 密码（可选）
   * @returns {Promise<Object|null>} 文件/目录信息对象
   */
  async getFileInfo(path, password = '') {
    if (!this.enabled) return null

    // 先检查缓存
    const cached = this.getCachedFileInfo(path)
    if (cached) {
      Logger.debug(`[OpenList] Using cached file info for: ${path}`)
      return cached
    }

    try {
      Logger.debug(`[OpenList] Getting file info from API: ${path}`)

      const response = await this.requestWithRetry(() => this.client.post('/api/fs/get', { path, password }), `getFileInfo(${path})`)

      if (response.data?.code === 200) {
        const fileInfo = response.data.data
        // 缓存结果
        this.cacheFileInfo(path, fileInfo)
        return fileInfo
      } else {
        Logger.error(`[OpenList] Get file info failed with code ${response.data?.code}: ${response.data?.message}`)
        return null
      }
    } catch (error) {
      Logger.error(`[OpenList] Failed to get file info "${path}":`, error.message)
      return null
    }
  }

  /**
   * 缓存文件信息
   * @param {string} path - 文件路径
   * @param {Object} fileInfo - 文件信息对象
   */
  cacheFileInfo(path, fileInfo) {
    this.fileInfoCache.set(path, {
      data: fileInfo,
      timestamp: Date.now()
    })
  }

  /**
   * 从缓存获取文件信息
   * @param {string} path - 文件路径
   * @returns {Object|null} 文件信息对象，如果缓存不存在或已过期则返回 null
   */
  getCachedFileInfo(path) {
    const cached = this.fileInfoCache.get(path)
    if (!cached) return null

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.fileInfoCache.delete(path)
      return null
    }

    return cached.data
  }

  /**
   * 清除文件信息缓存
   * @param {string} [path] - 可选，指定路径则只清除该路径的缓存，否则清除所有缓存
   */
  clearCache(path = null) {
    if (path) {
      this.fileInfoCache.delete(path)
    } else {
      this.fileInfoCache.clear()
    }
    Logger.debug(`[OpenList] Cache cleared${path ? ` for ${path}` : ''}`)
  }

  /**
   * 递归列出目录下所有文件
   * @param {string} path - 起始目录路径
   * @param {Object} options - 可选参数
   * @param {Function} options.filter - 文件过滤函数 (fileInfo) => boolean
   * @param {number} options.maxDepth - 最大递归深度（0 表示无限制）
   * @returns {Promise<Array>} 文件信息数组
   */
  async listDirectoryRecursive(path, options = {}) {
    if (!this.enabled) return []

    const { filter = () => true, maxDepth = 0, _currentDepth = 0 } = options

    // 检查递归深度
    if (maxDepth > 0 && _currentDepth >= maxDepth) {
      return []
    }

    const result = []

    try {
      const dirData = await this.listDirectory(path)
      if (!dirData || !dirData.content) {
        return []
      }

      for (const item of dirData.content) {
        const itemPath = path === '/' ? `/${item.name}` : `${path}/${item.name}`

        if (item.is_dir) {
          // 缓存目录信息
          this.cacheFileInfo(itemPath, { ...item, path: itemPath, is_dir: true })

          // 递归处理子目录
          const subItems = await this.listDirectoryRecursive(itemPath, {
            ...options,
            _currentDepth: _currentDepth + 1
          })
          result.push(...subItems)
        } else {
          // 文件：添加完整路径并应用过滤器
          const fileInfo = {
            ...item,
            path: itemPath
          }

          // 缓存文件信息（这样后续 getFileInfo 调用可以直接使用缓存）
          this.cacheFileInfo(itemPath, fileInfo)

          if (filter(fileInfo)) {
            result.push(fileInfo)
          }
        }
      }

      return result
    } catch (error) {
      Logger.error(`[OpenList] Failed to list directory recursively "${path}":`, error.message)
      return []
    }
  }

  /**
   * 获取文件下载链接
   * 优先使用缓存的 raw_url，如果没有则构造直接下载链接
   * @param {string} path - 文件路径
   * @param {string} password - 密码（可选）
   * @returns {Promise<string|null>} 下载链接
   */
  async getDownloadUrl(path, password = '') {
    // 首先检查缓存中是否有 raw_url
    const cached = this.getCachedFileInfo(path)
    if (cached && cached.raw_url) {
      Logger.debug(`[OpenList] Using cached raw_url for: ${path}`)
      return cached.raw_url
    }

    // 如果缓存中没有 raw_url，构造直接下载链接
    // OpenList/AList 的直接下载链接格式: {baseURL}/d{path}
    // 注意：path 已经以 / 开头
    const directUrl = `${this.baseURL}/d${path}`
    Logger.debug(`[OpenList] Constructed direct download URL: ${directUrl}`)

    // 如果需要签名（某些存储后端需要），则需要调用 API
    // 但为了避免超时，我们先尝试直接链接
    // 如果直接链接不工作，用户可以配置 OPENLIST_USE_SIGNED_URL=true 来强制使用签名链接
    if (process.env.OPENLIST_USE_SIGNED_URL === 'true') {
      try {
        const fileInfo = await this.getFileInfo(path, password)
        if (fileInfo && fileInfo.raw_url) {
          return fileInfo.raw_url
        }
      } catch (error) {
        Logger.warn(`[OpenList] Failed to get signed URL, falling back to direct URL: ${error.message}`)
      }
    }

    return directUrl
  }

  /**
   * 检查路径是否存在
   * @param {string} path - 路径
   * @returns {Promise<boolean>}
   */
  async pathExists(path) {
    if (!this.enabled) return false

    try {
      const fileInfo = await this.getFileInfo(path)
      return !!fileInfo
    } catch (error) {
      return false
    }
  }

  /**
   * 检查路径是否为目录
   * @param {string} path - 路径
   * @returns {Promise<boolean>}
   */
  async isDirectory(path) {
    if (!this.enabled) return false

    try {
      const fileInfo = await this.getFileInfo(path)
      return fileInfo?.is_dir === true
    } catch (error) {
      return false
    }
  }

  /**
   * 将 OpenList 文件信息转换为类似本地文件的格式
   * 用于与现有扫描逻辑兼容
   * @param {Object} openlistFile - OpenList 文件对象
   * @param {string} basePath - 基础路径
   * @returns {Object} 标准化的文件信息
   */
  normalizeFileInfo(openlistFile, basePath = '') {
    const fullPath = openlistFile.path || (basePath ? `${basePath}/${openlistFile.name}` : openlistFile.name)

    // 将 ISO 时间字符串转换为时间戳
    const modifiedMs = openlistFile.modified ? new Date(openlistFile.modified).getTime() : Date.now()

    return {
      name: openlistFile.name,
      path: fullPath,
      fullPath: fullPath,
      dirpath: basePath,
      reldirpath: basePath.replace(/^\//, ''),

      // 文件属性
      size: openlistFile.size || 0,
      mtimeMs: modifiedMs,
      ctimeMs: modifiedMs, // OpenList 没有 ctime，使用 mtime
      birthtimeMs: modifiedMs,

      // 使用路径 hash 作为 ino 的替代
      // 这样在 IGNORE_FILE_METADATA_CHANGES 模式下不会有问题
      ino: this.generateIno(fullPath),

      // 标记这是远程文件
      isRemote: true,
      isOpenList: true,

      // 保留原始 OpenList 数据
      _openlist: openlistFile
    }
  }

  /**
   * 为路径生成一个稳定的 ino 值
   * @param {string} path - 文件路径
   * @returns {string}
   */
  generateIno(path) {
    // 使用简单的字符串 hash 生成伪 inode
    let hash = 0
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString()
  }
}

// 导出单例
module.exports = new OpenListClient()
