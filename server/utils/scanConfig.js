/**
 * 扫描配置 - 针对网盘挂载优化
 * 
 * 环境变量配置：
 * - IGNORE_FILE_METADATA=true  # 忽略 inode/mtime/ctime 变化
 * - FAST_SCAN_MODE=true         # 启用快速扫描模式（只读取文件头）
 * - SKIP_EMBEDDED_CHAPTERS=true # 跳过嵌入章节扫描
 * 
 * 推荐配置（网盘挂载）：
 * export IGNORE_FILE_METADATA=true
 * export FAST_SCAN_MODE=true
 * export SKIP_EMBEDDED_CHAPTERS=true
 */

const IGNORE_FILE_METADATA_CHANGES = process.env.IGNORE_FILE_METADATA === 'true'
const FAST_SCAN_MODE = process.env.FAST_SCAN_MODE === 'true'
const SKIP_EMBEDDED_CHAPTERS = process.env.SKIP_EMBEDDED_CHAPTERS === 'true'

// 日志输出当前配置
if (IGNORE_FILE_METADATA_CHANGES || FAST_SCAN_MODE || SKIP_EMBEDDED_CHAPTERS) {
  const Logger = require('../Logger')
  Logger.info('[ScanConfig] Network storage optimization enabled:')
  if (IGNORE_FILE_METADATA_CHANGES) Logger.info('  - Ignoring file metadata changes (inode/mtime/ctime)')
  if (FAST_SCAN_MODE) Logger.info('  - Fast scan mode (limited file reading)')
  if (SKIP_EMBEDDED_CHAPTERS) Logger.info('  - Skipping embedded chapter scanning')
}

module.exports = {
  IGNORE_FILE_METADATA_CHANGES,
  FAST_SCAN_MODE,
  SKIP_EMBEDDED_CHAPTERS,
  
  /**
   * 获取 ffprobe 扫描选项
   * @returns {Object} ffprobe 选项配置
   */
  getProbeOptions() {
    if (FAST_SCAN_MODE) {
      return {
        // 快速模式：只分析文件头，不完整扫描
        analyzeduration: 5000000,  // 5 秒分析时长
        probesize: 5000000,        // 5 MB 探测大小
        skipChapters: SKIP_EMBEDDED_CHAPTERS
      }
    }
    
    return {
      // 标准模式：完整扫描
      analyzeduration: 0,
      probesize: 0,
      skipChapters: false
    }
  },
  
  /**
   * 判断两个库文件是否匹配
   * @param {Object} file1 
   * @param {Object} file2 
   * @returns {boolean}
   */
  isLibraryFileMatch(file1, file2) {
    // 优先使用路径匹配
    if (file1.metadata?.path && file2.metadata?.path) {
      return file1.metadata.path === file2.metadata.path
    }
    
    // 如果不忽略元数据，使用 inode 匹配作为后备
    if (!IGNORE_FILE_METADATA_CHANGES && file1.ino && file2.ino) {
      return file1.ino === file2.ino
    }
    
    return false
  },
  
  /**
   * 判断库文件是否应该被认为有变化
   * @param {Object} existing 现有文件
   * @param {Object} scanned 扫描到的文件
   * @returns {boolean}
   */
  hasLibraryFileChanged(existing, scanned) {
    const meta1 = existing.metadata || {}
    const meta2 = scanned.metadata || {}
    
    // 路径变化是真实变化
    if (meta1.path !== meta2.path) {
      return true
    }
    
    // 文件大小变化是真实变化
    if (meta1.size !== meta2.size) {
      return true
    }
    
    // 如果不忽略元数据，检查其他元数据
    if (!IGNORE_FILE_METADATA_CHANGES) {
      if (existing.ino !== scanned.ino) return true
      if (meta1.mtimeMs !== meta2.mtimeMs) return true
      if (meta1.ctimeMs !== meta2.ctimeMs) return true
    }
    
    return false
  },
  
  /**
   * 是否应该跳过章节扫描
   * @param {Object} audioFile 音频文件对象
   * @returns {boolean}
   */
  shouldSkipChapterScan(audioFile) {
    // 快速模式下跳过章节扫描
    if (FAST_SCAN_MODE || SKIP_EMBEDDED_CHAPTERS) {
      return true
    }
    
    // 文件过大时跳过章节扫描（超过 500MB）
    if (audioFile.metadata?.size > 500 * 1024 * 1024) {
      return true
    }
    
    return false
  },
  
  /**
   * 获取扫描批次大小
   * @returns {number}
   */
  getScanBatchSize() {
    // 快速模式使用更大的批次
    return FAST_SCAN_MODE ? 64 : 32
  }
}
