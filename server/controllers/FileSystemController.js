const { Request, Response } = require('express')
const Path = require('path')
const Logger = require('../Logger')
const fs = require('../libs/fsExtra')
const { toNumber } = require('../utils/index')
const fileUtils = require('../utils/fileUtils')
const Database = require('../Database')
const openlistClient = require('../libs/openlistClient')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class FileSystemController {
  constructor() {}

  /**
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getPaths(req, res) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[FileSystemController] Non-admin user "${req.user.username}" attempting to get filesystem paths`)
      return res.sendStatus(403)
    }

    const relpath = req.query.path
    const level = toNumber(req.query.level, 0)

    // Validate path. Must be absolute
    if (relpath && (!Path.isAbsolute(relpath) || !(await fs.pathExists(relpath)))) {
      Logger.error(`[FileSystemController] Invalid path in query string "${relpath}"`)
      return res.status(400).send('Invalid "path" query string')
    }
    Logger.debug(`[FileSystemController] Getting file paths at ${relpath || 'root'} (${level})`)

    let directories = []

    // Windows returns drives first
    if (global.isWin) {
      if (relpath) {
        directories = await fileUtils.getDirectoriesInPath(relpath, level)
      } else {
        const drives = await fileUtils.getWindowsDrives().catch((error) => {
          Logger.error(`[FileSystemController] Failed to get windows drives`, error)
          return []
        })
        if (drives.length) {
          directories = drives.map((d) => {
            return {
              path: d,
              dirname: d,
              level: 0
            }
          })
        }
      }
    } else {
      directories = await fileUtils.getDirectoriesInPath(relpath || '/', level)
    }

    // Exclude some dirs from this project to be cleaner in Docker
    const excludedDirs = ['node_modules', 'client', 'server', '.git', 'static', 'build', 'dist', 'metadata', 'config', 'sys', 'proc', '.devcontainer', '.nyc_output', '.github', '.vscode'].map((dirname) => {
      return fileUtils.filePathToPOSIX(Path.join(global.appRoot, dirname))
    })
    directories = directories.filter((dir) => {
      return !excludedDirs.includes(dir.path)
    })

    res.json({
      posix: !global.isWin,
      directories
    })
  }

  /**
   * GET: /api/filesystem/openlist
   * Get OpenList directories
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getOpenListPaths(req, res) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[FileSystemController] Non-admin user "${req.user.username}" attempting to get OpenList paths`)
      return res.sendStatus(403)
    }

    if (!openlistClient.isEnabled()) {
      Logger.error(`[FileSystemController] OpenList client not configured`)
      return res.status(400).json({
        error: 'OpenList not configured. Please set OPENLIST_URL and OPENLIST_TOKEN environment variables.'
      })
    }

    const relpath = req.query.path || '/'
    Logger.debug(`[FileSystemController] Getting OpenList paths at ${relpath}`)

    try {
      const dirData = await openlistClient.listDirectory(relpath)
      
      if (!dirData || !dirData.content) {
        Logger.error(`[FileSystemController] Failed to list OpenList directory: ${relpath}`)
        return res.status(500).json({
          error: 'Failed to list directory'
        })
      }

      // 只返回目录，不返回文件
      const directories = dirData.content
        .filter(item => item.is_dir)
        .map(item => {
          const itemPath = relpath === '/' ? `/${item.name}` : `${relpath}/${item.name}`
          return {
            path: itemPath,
            dirname: item.name,
            level: (relpath.split('/').filter(p => p).length)
          }
        })

      Logger.debug(`[FileSystemController] Found ${directories.length} directories in OpenList path: ${relpath}`)

      res.json({
        posix: true,
        directories,
        isOpenList: true
      })
    } catch (error) {
      Logger.error(`[FileSystemController] Error getting OpenList paths:`, error)
      res.status(500).json({
        error: 'Failed to get OpenList directories'
      })
    }
  }

  /**
   * GET: /api/filesystem/openlist/status
   * Check OpenList connection status
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getOpenListStatus(req, res) {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[FileSystemController] Non-admin user "${req.user.username}" attempting to check OpenList status`)
      return res.sendStatus(403)
    }

    const enabled = openlistClient.isEnabled()
    
    if (!enabled) {
      return res.json({
        enabled: false,
        connected: false,
        message: 'OpenList not configured'
      })
    }

    try {
      const connected = await openlistClient.testConnection()
      const settings = connected ? await openlistClient.getSettings() : null
      
      res.json({
        enabled: true,
        connected,
        settings: settings ? {
          title: settings.site_title,
          version: settings.version
        } : null
      })
    } catch (error) {
      Logger.error(`[FileSystemController] Error checking OpenList status:`, error)
      res.json({
        enabled: true,
        connected: false,
        error: error.message
      })
    }
  }

  /**
   * POST: /api/filesystem/pathexists
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async checkPathExists(req, res) {
    if (!req.user.canUpload) {
      Logger.error(`[FileSystemController] User "${req.user.username}" without upload permissions attempting to check path exists`)
      return res.sendStatus(403)
    }

    const { directory, folderPath } = req.body
    if (!directory?.length || typeof directory !== 'string' || !folderPath?.length || typeof folderPath !== 'string') {
      Logger.error(`[FileSystemController] Invalid request body: ${JSON.stringify(req.body)}`)
      return res.status(400).json({
        error: 'Invalid request body'
      })
    }

    // Check that library folder exists
    const libraryFolder = await Database.libraryFolderModel.findOne({
      where: {
        path: folderPath
      }
    })

    if (!libraryFolder) {
      Logger.error(`[FileSystemController] Library folder not found: ${folderPath}`)
      return res.sendStatus(404)
    }

    if (!req.user.checkCanAccessLibrary(libraryFolder.libraryId)) {
      Logger.error(`[FileSystemController] User "${req.user.username}" attempting to check path exists for library "${libraryFolder.libraryId}" without access`)
      return res.sendStatus(403)
    }

    let filepath = Path.join(libraryFolder.path, directory)
    filepath = fileUtils.filePathToPOSIX(filepath)

    // Ensure filepath is inside library folder (prevents directory traversal)
    if (!filepath.startsWith(libraryFolder.path)) {
      Logger.error(`[FileSystemController] Filepath is not inside library folder: ${filepath}`)
      return res.sendStatus(400)
    }

    if (await fs.pathExists(filepath)) {
      return res.json({
        exists: true
      })
    }

    // Check if a library item exists in a subdirectory
    // See: https://github.com/advplyr/audiobookshelf/issues/4146
    const cleanedDirectory = directory.split('/').filter(Boolean).join('/')
    if (cleanedDirectory.includes('/')) {
      // Can only be 2 levels deep
      const possiblePaths = []
      const subdir = Path.dirname(directory)
      possiblePaths.push(fileUtils.filePathToPOSIX(Path.join(folderPath, subdir)))
      if (subdir.includes('/')) {
        possiblePaths.push(fileUtils.filePathToPOSIX(Path.join(folderPath, Path.dirname(subdir))))
      }

      const libraryItem = await Database.libraryItemModel.findOne({
        where: {
          path: possiblePaths
        }
      })

      if (libraryItem) {
        return res.json({
          exists: true,
          libraryItemTitle: libraryItem.title
        })
      }
    }

    return res.json({
      exists: false
    })
  }
}
module.exports = new FileSystemController()
