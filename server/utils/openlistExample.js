/**
 * OpenList 客户端使用示例
 * 展示如何在扫描器中集成 OpenList
 */

const openlistClient = require('../libs/openlistClient')

/**
 * 示例 1: 检查路径是否为 OpenList 路径
 */
function isOpenListPath(path) {
  // OpenList 路径通常以特定前缀开始，或者在 library.provider 中标记
  // 这里简单判断：如果 OpenList 客户端已启用，且路径不是本地绝对路径
  return openlistClient.isEnabled() && !path.match(/^[A-Za-z]:|^\//)
}

/**
 * 示例 2: 统一的文件列表接口
 * 根据路径类型自动选择本地 fs 或 OpenList API
 */
async function listFiles(path, isOpenList = false) {
  if (isOpenList && openlistClient.isEnabled()) {
    // 使用 OpenList API
    console.log(`[Example] Listing OpenList directory: ${path}`)
    
    const audioExtensions = ['.mp3', '.m4a', '.m4b', '.flac', '.aac', '.ogg', '.opus', '.wav']
    
    const files = await openlistClient.listDirectoryRecursive(path, {
      filter: (file) => {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
        return audioExtensions.includes(ext)
      }
    })
    
    // 转换为标准格式
    return files.map(file => openlistClient.normalizeFileInfo(file))
  } else {
    // 使用本地 fs（现有逻辑）
    console.log(`[Example] Listing local directory: ${path}`)
    const fileUtils = require('./fileUtils')
    return await fileUtils.recurseFiles(path)
  }
}

/**
 * 示例 3: 统一的文件存在性检查
 */
async function pathExists(path, isOpenList = false) {
  if (isOpenList && openlistClient.isEnabled()) {
    return await openlistClient.pathExists(path)
  } else {
    const fs = require('../libs/fsExtra')
    return await fs.pathExists(path)
  }
}

/**
 * 示例 4: 获取文件元数据
 */
async function getFileMetadata(path, isOpenList = false) {
  if (isOpenList && openlistClient.isEnabled()) {
    const fileInfo = await openlistClient.getFileInfo(path)
    if (!fileInfo) return null
    
    return openlistClient.normalizeFileInfo(fileInfo)
  } else {
    const fileUtils = require('./fileUtils')
    return await fileUtils.getFileTimestampsWithIno(path)
  }
}

/**
 * 示例 5: 扫描书库文件夹
 * 这是一个简化的扫描逻辑示例
 */
async function scanLibraryFolder(libraryPath, isOpenList = false) {
  console.log(`\n=== 扫描书库: ${libraryPath} ===`)
  console.log(`存储类型: ${isOpenList ? 'OpenList' : '本地文件系统'}`)
  
  // 1. 检查路径是否存在
  const exists = await pathExists(libraryPath, isOpenList)
  if (!exists) {
    console.error(`路径不存在: ${libraryPath}`)
    return []
  }
  
  // 2. 列出所有音频文件
  console.log('正在扫描文件...')
  const files = await listFiles(libraryPath, isOpenList)
  console.log(`找到 ${files.length} 个音频文件`)
  
  // 3. 按目录分组（简化版）
  const bookGroups = {}
  for (const file of files) {
    // 假设每个子目录是一本书
    const parts = file.path.split('/')
    const bookDir = parts.slice(0, -1).join('/')
    
    if (!bookGroups[bookDir]) {
      bookGroups[bookDir] = []
    }
    bookGroups[bookDir].push(file)
  }
  
  console.log(`识别出 ${Object.keys(bookGroups).length} 本书`)
  
  // 4. 显示结果
  for (const [bookDir, bookFiles] of Object.entries(bookGroups)) {
    const totalSize = bookFiles.reduce((sum, f) => sum + f.size, 0)
    console.log(`\n📚 ${bookDir}`)
    console.log(`   文件数: ${bookFiles.length}`)
    console.log(`   总大小: ${formatSize(totalSize)}`)
    console.log(`   文件列表:`)
    bookFiles.forEach(f => {
      console.log(`     - ${f.name} (${formatSize(f.size)})`)
    })
  }
  
  return Object.entries(bookGroups).map(([dir, files]) => ({
    path: dir,
    files: files,
    totalSize: files.reduce((sum, f) => sum + f.size, 0)
  }))
}

/**
 * 示例 6: 比较文件是否变化
 * 使用优化的比较逻辑（只比较路径和大小）
 */
function hasFileChanged(existingFile, scannedFile) {
  // 路径变化
  if (existingFile.path !== scannedFile.path) {
    return true
  }
  
  // 大小变化
  if (existingFile.size !== scannedFile.size) {
    return true
  }
  
  // 在 IGNORE_FILE_METADATA=true 模式下，不检查 inode/mtime/ctime
  // 这对 OpenList 文件特别重要
  
  return false
}

/**
 * 示例 7: 获取音频文件下载链接（用于流式播放）
 */
async function getAudioStreamUrl(filePath, isOpenList = false) {
  if (isOpenList && openlistClient.isEnabled()) {
    // OpenList 文件：获取直接下载链接
    const downloadUrl = await openlistClient.getDownloadUrl(filePath)
    console.log(`[Example] OpenList stream URL: ${downloadUrl}`)
    return downloadUrl
  } else {
    // 本地文件：返回本地路径
    console.log(`[Example] Local file path: ${filePath}`)
    return filePath
  }
}

// 工具函数
function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 导出示例函数
module.exports = {
  isOpenListPath,
  listFiles,
  pathExists,
  getFileMetadata,
  scanLibraryFolder,
  hasFileChanged,
  getAudioStreamUrl
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
  const testPath = process.argv[2] || '/audiobooks'
  const isOpenList = process.argv[3] === 'openlist'
  
  console.log('OpenList 集成示例')
  console.log('='.repeat(60))
  
  scanLibraryFolder(testPath, isOpenList)
    .then(() => {
      console.log('\n✓ 示例执行完成')
    })
    .catch(error => {
      console.error('\n❌ 示例执行失败:', error.message)
      console.error(error.stack)
      process.exit(1)
    })
}
