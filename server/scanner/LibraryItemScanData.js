// 在 LibraryItemScanData.js 文件开头添加全局配置
const packageJson = require('../../package.json')
const { LogLevel } = require('../utils/constants')
const LibraryItem = require('../models/LibraryItem')
const globals = require('../utils/globals')

// 添加配置：是否忽略文件元数据变化（适用于网盘挂载）
// 可以通过环境变量或服务器设置来控制
const IGNORE_FILE_METADATA_CHANGES = process.env.IGNORE_FILE_METADATA === 'true' || false

class LibraryItemScanData {
  // ... 保持原有代码不变 ...

  /**
   * 修改这个方法以支持忽略元数据变化
   * @param {LibraryItem} existingLibraryItem 
   * @param {import('./LibraryScan')} libraryScan
   * @returns {boolean} true if changes found
   */
  async checkLibraryItemData(existingLibraryItem, libraryScan) {
    const keysToCompare = ['libraryFolderId', 'path', 'relPath', 'isFile']
    
    // 只有在不忽略元数据时才比较 ino
    if (!IGNORE_FILE_METADATA_CHANGES) {
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

    // 如果启用了忽略元数据变化模式，跳过时间戳检查
    if (!IGNORE_FILE_METADATA_CHANGES) {
      // Check mtime, ctime and birthtime
      if (existingLibraryItem.mtime?.valueOf() !== this.mtimeMs) {
        libraryScan.addLog(LogLevel.DEBUG, `Library item "${existingLibraryItem.relPath}" key "mtime" changed from "${existingLibraryItem.mtime?.valueOf()}" to "${this.mtimeMs}"`)
        existingLibraryItem.mtime = this.mtimeMs
        this.hasChanges = true
      }
      if (existingLibraryItem.birthtime?.valueOf() !== this.birthtimeMs) {
        libraryScan.addLog(LogLevel.DEBUG, `Library item "${existingLibraryItem.relPath}" key "birthtime" changed from "${existingLibraryItem.birthtime?.valueOf()}" to "${this.birthtimeMs}"`)
        existingLibraryItem.birthtime = this.birthtimeMs
        this.hasChanges = true
      }
      if (existingLibraryItem.ctime?.valueOf() !== this.ctimeMs) {
        libraryScan.addLog(LogLevel.DEBUG, `Library item "${existingLibraryItem.relPath}" key "ctime" changed from "${existingLibraryItem.ctime?.valueOf()}" to "${this.ctimeMs}"`)
        existingLibraryItem.ctime = this.ctimeMs
        this.hasChanges = true
      }
    } else {
      // 在忽略模式下，静默更新时间戳以保持数据库同步
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
      // Find matching library file using path first and fallback to using inode value
      let matchingLibraryFile = this.libraryFiles.find(lf => lf.metadata.path === existingLibraryFile.metadata.path)
      
      // 只有在不忽略元数据时才使用 inode 作为备用匹配方式
      if (!matchingLibraryFile && !IGNORE_FILE_METADATA_CHANGES) {
        matchingLibraryFile = this.libraryFiles.find(lf => lf.ino === existingLibraryFile.ino)
        if (matchingLibraryFile) {
          libraryScan.addLog(LogLevel.INFO, `Library file with path "${existingLibraryFile.metadata.path}" not found, but found file with matching inode value "${existingLibraryFile.ino}" at path "${matchingLibraryFile.metadata.path}"`)
        }
      }

      if (!matchingLibraryFile) {
        libraryScan.addLog(LogLevel.INFO, `Library file "${existingLibraryFile.metadata.path}" was removed from library item "${existingLibraryItem.relPath}"`)
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

    // 剩余代码保持不变...
    if (libraryFilesAdded.length) {
      this.hasChanges = true
      for (const libraryFile of libraryFilesAdded) {
        libraryScan.addLog(LogLevel.INFO, `New library file found with path "${libraryFile.metadata.path}" for library item "${existingLibraryItem.relPath}"`)
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

      libraryScan.addLog(LogLevel.DEBUG, `Library item "${existingLibraryItem.relPath}" changed: [${existingLibraryItem.changed()?.join(',') || ''}]`)

      if (this.hasLibraryFileChanges) {
        existingLibraryItem.changed('libraryFiles', true)
      }
      await existingLibraryItem.save()
      return true
    }

    return false
  }

  /**
   * 修改这个方法以支持忽略元数据变化
   */
  compareUpdateLibraryFile(libraryItemPath, existingLibraryFile, scannedLibraryFile, libraryScan) {
    let hasChanges = false

    // 只有在不忽略元数据时才比较 ino
    if (!IGNORE_FILE_METADATA_CHANGES && existingLibraryFile.ino !== scannedLibraryFile.ino) {
      existingLibraryFile.ino = scannedLibraryFile.ino
      hasChanges = true
    } else if (IGNORE_FILE_METADATA_CHANGES) {
      // 静默更新 ino
      existingLibraryFile.ino = scannedLibraryFile.ino
    }

    for (const key in existingLibraryFile.metadata) {
      // 在忽略模式下，跳过时间戳的比较，但仍然检查路径和文件大小
      if (IGNORE_FILE_METADATA_CHANGES && (key === 'mtimeMs' || key === 'ctimeMs')) {
        // 静默更新时间戳
        existingLibraryFile.metadata[key] = scannedLibraryFile.metadata[key]
        continue
      }

      if (existingLibraryFile.metadata[key] !== scannedLibraryFile.metadata[key]) {
        // 文件大小变化或路径变化是真实的变化
        if (key === 'size' || key === 'path' || key === 'relPath') {
          if (key !== 'path' && key !== 'relPath') {
            libraryScan.addLog(LogLevel.DEBUG, `Library file "${existingLibraryFile.metadata.relPath}" for library item "${libraryItemPath}" key "${key}" changed from "${existingLibraryFile.metadata[key]}" to "${scannedLibraryFile.metadata[key]}"`)
          } else {
            libraryScan.addLog(LogLevel.DEBUG, `Library file for library item "${libraryItemPath}" key "${key}" changed from "${existingLibraryFile.metadata[key]}" to "${scannedLibraryFile.metadata[key]}"`)
          }
          existingLibraryFile.metadata[key] = scannedLibraryFile.metadata[key]
          hasChanges = true
        } else if (!IGNORE_FILE_METADATA_CHANGES) {
          // 在非忽略模式下，其他元数据变化也算作变化
          if (key !== 'path' && key !== 'relPath') {
            libraryScan.addLog(LogLevel.DEBUG, `Library file "${existingLibraryFile.metadata.relPath}" for library item "${libraryItemPath}" key "${key}" changed from "${existingLibraryFile.metadata[key]}" to "${scannedLibraryFile.metadata[key]}"`)
          } else {
            libraryScan.addLog(LogLevel.DEBUG, `Library file for library item "${libraryItemPath}" key "${key}" changed from "${existingLibraryFile.metadata[key]}" to "${scannedLibraryFile.metadata[key]}"`)
          }
          existingLibraryFile.metadata[key] = scannedLibraryFile.metadata[key]
          hasChanges = true
        } else {
          // 在忽略模式下，静默更新其他元数据
          existingLibraryFile.metadata[key] = scannedLibraryFile.metadata[key]
        }
      }
    }

    if (hasChanges) {
      existingLibraryFile.updatedAt = Date.now()
    }

    return hasChanges
  }

  // 其他方法保持不变...
}

module.exports = LibraryItemScanData
