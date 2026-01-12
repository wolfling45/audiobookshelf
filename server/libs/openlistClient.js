const axios = require('axios')
const Logger = require('../Logger')

/**
 * OpenList API 客户端
 * 用于与 OpenList/AList 服务器通信
 * 
 * 环境变量：
 * - OPENLIST_URL: OpenList 服务器地址（如 http://localhost:5244）
 * - OPENLIST_TOKEN: API 访问令牌
 */
class OpenListClient {
  constructor() {
    this.baseURL = process.env.OPENLIST_URL
    this.token = process.env.OPENLIST_TOKEN
    this.enabled = !!(this.baseURL && this.token)
    
    if (this.enabled) {
      Logger.info(`[OpenList] Client initialized with URL: ${this.baseURL}`)
      
      // 创建 axios 实例
      this.client = axios.create({
        baseURL: this.baseURL,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      })
      
      // 添加响应拦截器用于错误处理
      this.client.interceptors.response.use(
        response => response,
        error => {
          Logger.error('[OpenList] API request failed:', error.message)
          if (error.response) {
            Logger.error('[OpenList] Response status:', error.response.status)
            Logger.error('[OpenList] Response data:', error.response.data)
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
    
    const {
      password = '',
      page = 1,
      perPage = 0,
      refresh = false
    } = options
    
    try {
      Logger.debug(`[OpenList] Listing directory: ${path}`)
      
      const response = await this.client.post('/api/fs/list', {
        path,
        password,
        page,
        per_page: perPage,
        refresh
      })
      
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
    
    try {
      Logger.debug(`[OpenList] Getting file info: ${path}`)
      
      const response = await this.client.post('/api/fs/get', {
        path,
        password
      })
      
      if (response.data?.code === 200) {
        return response.data.data
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
   * 递归列出目录下所有文件
   * @param {string} path - 起始目录路径
   * @param {Object} options - 可选参数
   * @param {Function} options.filter - 文件过滤函数 (fileInfo) => boolean
   * @param {number} options.maxDepth - 最大递归深度（0 表示无限制）
   * @returns {Promise<Array>} 文件信息数组
   */
  async listDirectoryRecursive(path, options = {}) {
    if (!this.enabled) return []
    
    const {
      filter = () => true,
      maxDepth = 0,
      _currentDepth = 0
    } = options
    
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
   * @param {string} path - 文件路径
   * @param {string} password - 密码（可选）
   * @returns {Promise<string|null>} 下载链接
   */
  async getDownloadUrl(path, password = '') {
    const fileInfo = await this.getFileInfo(path, password)
    if (!fileInfo) return null
    
    // OpenList 返回的 raw_url 是直接下载链接
    return fileInfo.raw_url || fileInfo.url || null
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
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString()
  }
}

// 导出单例
module.exports = new OpenListClient()
