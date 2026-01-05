/**
 * ffprobe 结果缓存系统
 * 基于文件内容哈希，避免重复探测
 */

const crypto = require('crypto')
const fs = require('fs').promises
const LRU = require('lru-cache')
const Logger = require('../Logger')
const scanConfig = require('./scanConfig')

class ProbeCache {
  constructor() {
    // 使用 LRU 缓存，自动淘汰旧数据
    this.cache = new LRU({
      max: scanConfig.PROBE_CACHE_SIZE,
      ttl: scanConfig.PROBE_CACHE_TTL * 1000, // 转为毫秒
      updateAgeOnGet: true,
      updateAgeOnHas: true
    })
    
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0
    }
  }
  
  /**
   * 计算文件内容哈希（只读取前 1MB）
   * @param {string} filePath 
   * @returns {Promise<string|null>}
   */
  async getFileHash(filePath) {
    try {
      const fd = await fs.open(filePath, 'r')
      try {
        // 只读取前 1MB 用于计算哈希
        const buffer = Buffer.alloc(Math.min(1024 * 1024, await this.getFileSize(filePath)))
        await fd.read(buffer, 0, buffer.length, 0)
        
        // 计算 SHA256 哈希
        const hash = crypto.createHash('sha256')
        hash.update(buffer)
        return hash.digest('hex').substring(0, 32) // 只取前 32 位
      } finally {
        await fd.close()
      }
    } catch (error) {
      Logger.error(`[ProbeCache] Failed to calculate hash for "${filePath}":`, error.message)
      this.stats.errors++
      return null
    }
  }
  
  /**
   * 获取文件大小
   * @param {string} filePath 
   * @returns {Promise<number>}
   */
  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath)
      return stats.size
    } catch {
      return 0
    }
  }
  
  /**
   * 生成缓存键
   * @param {string} filePath 
   * @param {number} fileSize 
   * @returns {Promise<string|null>}
   */
  async getCacheKey(filePath, fileSize) {
    const hash = await this.getFileHash(filePath)
    if (!hash) return null
    
    // 缓存键 = 哈希 + 文件大小（避免哈希碰撞）
    return `${hash}_${fileSize}`
  }
  
  /**
   * 获取缓存的 probe 数据
   * @param {string} filePath 
   * @returns {Promise<Object|null>}
   */
  async get(filePath) {
    if (!scanConfig.shouldUseCache()) {
      return null
    }
    
    try {
      const fileSize = await this.getFileSize(filePath)
      const cacheKey = await this.getCacheKey(filePath, fileSize)
      
      if (!cacheKey) {
        return null
      }
      
      const cached = this.cache.get(cacheKey)
      
      if (cached) {
        this.stats.hits++
        Logger.debug(`[ProbeCache] Hit for "${filePath}" (${this.getHitRate()}% hit rate)`)
        return cached
      } else {
        this.stats.misses++
        return null
      }
    } catch (error) {
      Logger.error(`[ProbeCache] Error getting cache for "${filePath}":`, error.message)
      this.stats.errors++
      return null
    }
  }
  
  /**
   * 设置缓存
   * @param {string} filePath 
   * @param {Object} probeData 
   * @returns {Promise<boolean>}
   */
  async set(filePath, probeData) {
    if (!scanConfig.shouldUseCache()) {
      return false
    }
    
    try {
      const fileSize = await this.getFileSize(filePath)
      const cacheKey = await this.getCacheKey(filePath, fileSize)
      
      if (!cacheKey) {
        return false
      }
      
      this.cache.set(cacheKey, probeData)
      Logger.debug(`[ProbeCache] Cached probe data for "${filePath}"`)
      return true
    } catch (error) {
      Logger.error(`[ProbeCache] Error setting cache for "${filePath}":`, error.message)
      this.stats.errors++
      return false
    }
  }
  
  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear()
    Logger.info('[ProbeCache] Cache cleared')
  }
  
  /**
   * 获取缓存命中率
   * @returns {string}
   */
  getHitRate() {
    const total = this.stats.hits + this.stats.misses
    if (total === 0) return '0.0'
    return ((this.stats.hits / total) * 100).toFixed(1)
  }
  
  /**
   * 获取缓存统计
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: scanConfig.PROBE_CACHE_SIZE,
      hitRate: this.getHitRate() + '%'
    }
  }
  
  /**
   * 打印统计信息
   */
  logStats() {
    const stats = this.getStats()
    Logger.info(`[ProbeCache] Stats: ${stats.hits} hits, ${stats.misses} misses, ${stats.hitRate} hit rate, ${stats.size}/${stats.maxSize} cached`)
  }
}

// 导出单例
module.exports = new ProbeCache()
