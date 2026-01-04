// ===== 1. 创建配置文件 server/utils/scanConfig.js =====
/**
 * 扫描配置 - 用于网盘挂载等场景
 * 当文件系统的 inode/mtime/ctime 不可靠时（如网盘挂载），可以启用此模式
 */
const IGNORE_FILE_METADATA_CHANGES = process.env.IGNORE_FILE_METADATA === 'true' || false

module.exports = {
  IGNORE_FILE_METADATA_CHANGES,
  
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
    
    // 如果不忽略元数据，使用 inode 匹配
    if (!IGNORE_FILE_METADATA_CHANGES && file1.ino && file2.ino) {
      return file1.ino === file2.ino
    }
    
    // 在忽略模式下，只使用路径和文件大小匹配
    if (IGNORE_FILE_METADATA_CHANGES) {
      return file1.metadata?.path === file2.metadata?.path &&
             file1.metadata?.size === file2.metadata?.size
    }
    
    return false
  },
  
  /**
   * 判断库项目是否应该被认为有变化
   * @param {Object} existing 
   * @param {Object} scanned 
   * @returns {boolean}
   */
  hasLibraryItemChanged(existing, scanned) {
    // 路径变化
    if (existing.path !== scanned.path || existing.relPath !== scanned.relPath) {
      return true
    }
    
    // 如果不忽略元数据，检查 inode 和时间戳
    if (!IGNORE_FILE_METADATA_CHANGES) {
      if (existing.ino !== scanned.ino) return true
      if (existing.mtime?.valueOf() !== scanned.mtimeMs) return true
      if (existing.ctime?.valueOf() !== scanned.ctimeMs) return true
      if (existing.birthtime?.valueOf() !== scanned.birthtimeMs) return true
    }
    
    return false
  },
  
  /**
   * 判断库文件是否应该被认为有变化
   * @param {Object} existing 
   * @param {Object} scanned 
   * @returns {boolean}
   */
  hasLibraryFileChanged(existing, scanned) {
    const meta1 = existing.metadata || {}
    const meta2 = scanned.metadata || {}
    
    // 路径或大小变化都是真实变化
    if (meta1.path !== meta2.path || meta1.size !== meta2.size) {
      return true
    }
    
    // 如果不忽略元数据，检查 inode 和时间戳
    if (!IGNORE_FILE_METADATA_CHANGES) {
      if (existing.ino !== scanned.ino) return true
      if (meta1.mtimeMs !== meta2.mtimeMs) return true
      if (meta1.ctimeMs !== meta2.ctimeMs) return true
    }
    
    return false
  }
}

// ===== 2. 修改 LibraryItemScanData.js =====
// 在文件开头添加：
const scanConfig = require('../utils/scanConfig')

// 修改 checkLibraryItemData 方法：
async checkLibraryItemData(existingLibraryItem, libraryScan) {
  const keysToCompare = ['libraryFolderId', 'path', 'relPath', 'isFile']
  
  // 只有在不忽略元数据时才比较 ino
  if (!scanConfig.IGNORE_FILE_METADATA_CHANGES) {
    keysToCompare.unshift('ino')
  }
  
  this.hasChanges = false
  this.hasPathChange = false
  
  for (const key of keysToCompare) {
    if (existingLibraryItem[key] !== this[key]) {
      libraryScan.addLog(LogLevel.DEBUG, `Library item "${existingLibraryItem.relPath}" key "${key}" changed from "${existingLibraryItem[key]}" to "${this[key]}"`)
      existingLibraryItem[key] = this[key]
      this.hasChanges = true

      if (key === 'relPath' || key === 'path') {
        this.hasPathChange = true
      }
    }
  }

  // 使用配置模块的方法检查变化
  if (!scanConfig.IGNORE_FILE_METADATA_CHANGES) {
    // 检查时间戳
    if (existingLibraryItem.mtime?.valueOf() !== this.mtimeMs) {
      libraryScan.addLog(LogLevel.DEBUG, `Library item "${existingLibraryItem.relPath}" key "mtime" changed`)
      existingLibraryItem.mtime = this.mtimeMs
      this.hasChanges = true
    }
    if (existingLibraryItem.birthtime?.valueOf() !== this.birthtimeMs) {
      existingLibraryItem.birthtime = this.birthtimeMs
      this.hasChanges = true
    }
    if (existingLibraryItem.ctime?.valueOf() !== this.ctimeMs) {
      existingLibraryItem.ctime = this.ctimeMs
      this.hasChanges = true
    }
  } else {
    // 在忽略模式下，静默更新时间戳
    existingLibraryItem.mtime = this.mtimeMs
    existingLibraryItem.birthtime = this.birthtimeMs
    existingLibraryItem.ctime = this.ctimeMs
  }

  if (existingLibraryItem.isMissing) {
    libraryScan.addLog(LogLevel.DEBUG, `Library item "${existingLibraryItem.relPath}" was missing but now found`)
    existingLibraryItem.isMissing = false
    this.hasChanges = true
  }

  this.libraryFilesRemoved = []
  this.libraryFilesModified = []
  let libraryFilesAdded = this.libraryFiles.map(lf => lf)

  for (const existingLibraryFile of existingLibraryItem.libraryFiles) {
    // 使用配置模块的匹配方法
    let matchingLibraryFile = this.libraryFiles.find(lf => 
      scanConfig.isLibraryFileMatch(lf, existingLibraryFile)
    )
    
    // 备用：按路径查找
    if (!matchingLibraryFile) {
      matchingLibraryFile = this.libraryFiles.find(lf => 
        lf.metadata.path === existingLibraryFile.metadata.path
      )
    }

    if (!matchingLibraryFile) {
      libraryScan.addLog(LogLevel.INFO, `Library file "${existingLibraryFile.metadata.path}" was removed`)
      this.libraryFilesRemoved.push(existingLibraryFile)
      existingLibraryItem.libraryFiles = existingLibraryItem.libraryFiles.filter(lf => lf !== existingLibraryFile)
      this.hasChanges = true
    } else {
      libraryFilesAdded = libraryFilesAdded.filter(lf => lf !== matchingLibraryFile)
      let existingLibraryFileBefore = structuredClone(existingLibraryFile)
      if (this.compareUpdateLibraryFile(existingLibraryItem.path, existingLibraryFile, matchingLibraryFile, libraryScan)) {
        this.libraryFilesModified.push({old: existingLibraryFileBefore, new: existingLibraryFile})
        this.hasChanges = true
      }
    }
  }

  // 其余代码保持不变...
  if (libraryFilesAdded.length) {
    this.hasChanges = true
    for (const libraryFile of libraryFilesAdded) {
      libraryScan.addLog(LogLevel.INFO, `New library file found with path "${libraryFile.metadata.path}"`)
      if (libraryFile.isEBookFile) {
        libraryFile.isSupplementary = true
      }
      existingLibraryItem.libraryFiles.push(libraryFile.toJSON())
    }
  }

  this.libraryFilesAdded = libraryFilesAdded

  if (this.hasChanges) {
    existingLibraryItem.size = 0
    existingLibraryItem.libraryFiles.forEach((lf) => existingLibraryItem.size += lf.metadata.size)
    existingLibraryItem.lastScan = Date.now()
    existingLibraryItem.lastScanVersion = packageJson.version

    if (this.hasLibraryFileChanges) {
      existingLibraryItem.changed('libraryFiles', true)
    }
    await existingLibraryItem.save()
    return true
  }

  return false
}

// 修改 compareUpdateLibraryFile 方法：
compareUpdateLibraryFile(libraryItemPath, existingLibraryFile, scannedLibraryFile, libraryScan) {
  let hasChanges = false

  // 使用配置模块检查是否有变化
  const metadataChanged = scanConfig.hasLibraryFileChanged(existingLibraryFile, scannedLibraryFile)
  
  if (metadataChanged) {
    libraryScan.addLog(LogLevel.DEBUG, `Library file "${existingLibraryFile.metadata.relPath}" has real changes`)
    hasChanges = true
  }
  
  // 更新所有字段（包括在忽略模式下静默更新时间戳）
  if (!scanConfig.IGNORE_FILE_METADATA_CHANGES) {
    existingLibraryFile.ino = scannedLibraryFile.ino
  } else {
    // 静默更新
    existingLibraryFile.ino = scannedLibraryFile.ino
  }
  
  for (const key in existingLibraryFile.metadata) {
    if (existingLibraryFile.metadata[key] !== scannedLibraryFile.metadata[key]) {
      // 在忽略模式下，时间戳变化不算作真正的变化
      if (scanConfig.IGNORE_FILE_METADATA_CHANGES && 
          (key === 'mtimeMs' || key === 'ctimeMs')) {
        existingLibraryFile.metadata[key] = scannedLibraryFile.metadata[key]
        continue
      }
      
      // 其他字段的变化
      if (key === 'size' || key === 'path' || key === 'relPath') {
        libraryScan.addLog(LogLevel.DEBUG, `Library file key "${key}" changed`)
        hasChanges = true
      } else if (!scanConfig.IGNORE_FILE_METADATA_CHANGES) {
        hasChanges = true
      }
      
      existingLibraryFile.metadata[key] = scannedLibraryFile.metadata[key]
    }
  }

  if (hasChanges) {
    existingLibraryFile.updatedAt = Date.now()
  }

  return hasChanges
}

// ===== 3. 修改 LibraryScanner.js =====
// 在文件开头添加：
const scanConfig = require('../utils/scanConfig')

// 修改 findLibraryItemByItemToItemInoMatch 函数（在文件底部）：
async function findLibraryItemByItemToItemInoMatch(libraryId, fullPath) {
  // 如果忽略元数据，跳过 inode 匹配
  if (scanConfig.IGNORE_FILE_METADATA_CHANGES) {
    return null
  }
  
  const ino = await fileUtils.getIno(fullPath)
  if (!ino) return null
  const existingLibraryItem = await Database.libraryItemModel.findOneExpanded({
    libraryId: libraryId,
    ino: ino
  })
  if (existingLibraryItem) {
    Logger.debug(`[LibraryScanner] Found library item with matching inode "${ino}"`)
  }
  return existingLibraryItem
}

// 同样修改 findLibraryItemByItemToFileInoMatch 和 findLibraryItemByFileToItemInoMatch
async function findLibraryItemByItemToFileInoMatch(libraryId, fullPath, isSingleMedia) {
  if (!isSingleMedia || scanConfig.IGNORE_FILE_METADATA_CHANGES) return null
  // ... 其余代码保持不变
}

async function findLibraryItemByFileToItemInoMatch(libraryId, fullPath, isSingleMedia, itemFiles) {
  if (isSingleMedia || scanConfig.IGNORE_FILE_METADATA_CHANGES) return null
  // ... 其余代码保持不变
}

// ===== 使用说明 =====
/**
 * 启动时设置环境变量：
 * 
 * export IGNORE_FILE_METADATA=true
 * node server/index.js
 * 
 * 或在 Docker 中：
 * docker run -e IGNORE_FILE_METADATA=true ...
 * 
 * 或在 docker-compose.yml 中：
 * environment:
 *   - IGNORE_FILE_METADATA=true
 * 
 * 启用后的行为：
 * ✅ 检测新增/删除的文件
 * ✅ 检测文件大小变化
 * ✅ 检测路径变化
 * ❌ 忽略 inode 变化
 * ❌ 忽略 mtime/ctime 变化
 */
