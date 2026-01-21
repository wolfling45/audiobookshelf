/**
 * 扫描配置 - 用于网盘挂载等场景
 * 当文件系统的 inode/mtime/ctime 不可靠时（如网盘挂载），可以启用此模式
 *
 * 使用方法：
 * export IGNORE_FILE_METADATA=true
 * 或在 docker-compose.yml 中设置环境变量
 */

const IGNORE_FILE_METADATA_CHANGES = process.env.IGNORE_FILE_METADATA === 'true' || false

// 启动时输出配置状态
if (IGNORE_FILE_METADATA_CHANGES) {
  console.log('[scanConfig] IGNORE_FILE_METADATA mode enabled - file change detection will only use path and size')
}

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

    return false
  },

  /**
   * 判断库文件是否应该被认为有变化（只比较真实内容变化）
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
  },

  /**
   * 生成基于路径的替代 ino 值
   * @param {string} path
   * @returns {string}
   */
  generatePathBasedIno(path) {
    return `path-${Buffer.from(path).toString('base64').slice(0, 20)}`
  },

  /**
   * 获取有效的 ino 值，如果原始 ino 为空且在忽略模式下，返回基于路径的替代值
   * @param {string|null} originalIno
   * @param {string} path
   * @returns {string|null}
   */
  getEffectiveIno(originalIno, path) {
    if (originalIno) return originalIno
    if (IGNORE_FILE_METADATA_CHANGES) {
      return this.generatePathBasedIno(path)
    }
    return originalIno
  }
}
