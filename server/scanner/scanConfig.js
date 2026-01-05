/**
 * 扫描配置模块 - 网盘优化版
 * 支持快速扫描模式和缓存
 */

// 扫描模式
const SCAN_MODE = {
  FAST: 'fast',      // 快速模式：只要音频流+章节，跳过元数据和封面
  NORMAL: 'normal',  // 正常模式：完整元数据但跳过封面搜索
  FULL: 'full'       // 完整模式：包括在线封面搜索
}

// 从环境变量读取配置
const config = {
  // 文件元数据处理（你已经在用）
  IGNORE_FILE_METADATA_CHANGES: process.env.IGNORE_FILE_METADATA === 'true' || false,
  
  // 扫描模式
  SCAN_MODE: process.env.SCAN_MODE || 'normal',
  
  // 精细控制开关
  SKIP_COVER_EXTRACTION: process.env.SKIP_COVER === 'true' || false,
  SKIP_METADATA_TAGS: process.env.SKIP_METADATA_TAGS === 'true' || false,
  SKIP_COVER_SEARCH: process.env.SKIP_COVER_SEARCH === 'true' || false,
  SKIP_EBOOK_METADATA: process.env.SKIP_EBOOK_METADATA === 'true' || false,
  
  // 缓存配置
  ENABLE_PROBE_CACHE: process.env.ENABLE_PROBE_CACHE === 'true' || false,
  PROBE_CACHE_TTL: parseInt(process.env.PROBE_CACHE_TTL) || 7 * 24 * 60 * 60, // 默认 7 天
  PROBE_CACHE_SIZE: parseInt(process.env.PROBE_CACHE_SIZE) || 10000, // 默认缓存 10000 个文件
  
  // ffprobe 优化
  USE_MINIMAL_PROBE: process.env.USE_MINIMAL_PROBE === 'true' || false,
  
  // 并发控制（网盘优化）
  PROBE_BATCH_SIZE: parseInt(process.env.PROBE_BATCH_SIZE) || 8, // 从 32 降到 8
  PROBE_TIMEOUT: parseInt(process.env.PROBE_TIMEOUT) || 30000, // 30 秒超时
  PROBE_RETRY_TIMES: parseInt(process.env.PROBE_RETRY_TIMES) || 3, // 重试 3 次
}

// 根据扫描模式自动设置
if (config.SCAN_MODE === 'fast') {
  config.SKIP_COVER_EXTRACTION = true
  config.SKIP_METADATA_TAGS = true
  config.SKIP_COVER_SEARCH = true
  config.USE_MINIMAL_PROBE = true
  config.ENABLE_PROBE_CACHE = true
  console.log('[ScanConfig] Fast mode enabled - skipping cover and metadata tags')
} else if (config.SCAN_MODE === 'normal') {
  config.SKIP_COVER_SEARCH = true
  console.log('[ScanConfig] Normal mode enabled - skipping online cover search')
}

// 导出配置
module.exports = {
  SCAN_MODE,
  ...config,
  
  // 快捷判断方法
  isFastMode: () => config.SCAN_MODE === 'fast',
  shouldSkipCover: () => config.SKIP_COVER_EXTRACTION || config.SCAN_MODE === 'fast',
  shouldSkipMetadata: () => config.SKIP_METADATA_TAGS || config.SCAN_MODE === 'fast',
  shouldSkipCoverSearch: () => config.SKIP_COVER_SEARCH || config.SCAN_MODE !== 'full',
  shouldUseCache: () => config.ENABLE_PROBE_CACHE,
  shouldUseMinimalProbe: () => config.USE_MINIMAL_PROBE || config.SCAN_MODE === 'fast',
  
  // 文件匹配方法（兼容原有逻辑）
  isLibraryFileMatch(file1, file2) {
    if (file1.metadata?.path && file2.metadata?.path) {
      return file1.metadata.path === file2.metadata.path
    }
    if (!config.IGNORE_FILE_METADATA_CHANGES && file1.ino && file2.ino) {
      return file1.ino === file2.ino
    }
    return false
  },
  
  hasLibraryFileChanged(existing, scanned) {
    const meta1 = existing.metadata || {}
    const meta2 = scanned.metadata || {}
    
    if (meta1.path !== meta2.path || meta1.size !== meta2.size) {
      return true
    }
    
    if (!config.IGNORE_FILE_METADATA_CHANGES) {
      if (existing.ino !== scanned.ino) return true
      if (meta1.mtimeMs !== meta2.mtimeMs) return true
      if (meta1.ctimeMs !== meta2.ctimeMs) return true
    }
    
    return false
  }
}
