const Logger = require('../Logger')
const Database = require('../Database')

/**
 * 同步控制器
 * 用于本地服务器和 VPS 之间的媒体库数据同步
 *
 * 导出：导出媒体库相关表的数据（流式输出避免内存溢出）
 * 导入：导入媒体库数据，保留用户数据（用户、进度等）
 */
class SyncController {
  constructor() {}

  /**
   * 流式写入一个表的数据到 response
   * @param {import('express').Response} res
   * @param {string} table
   */
  async _streamTable(res, table) {
    const [rows] = await Database.sequelize.query(`SELECT * FROM ${table}`)
    res.write(`"${table}":`)
    // 分批写入避免单次 JSON.stringify 过大
    res.write('[')
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) res.write(',')
      res.write(JSON.stringify(rows[i]))
    }
    res.write(']')
    return rows.length
  }

  /**
   * 导出媒体库数据（流式）
   * GET /api/sync/export
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async exportLibraryData(req, res) {
    try {
      Logger.info('[SyncController] Starting library data export (streaming)...')

      const tables = ['libraries', 'libraryFolders', 'libraryItems', 'books', 'podcasts', 'podcastEpisodes', 'authors', 'series', 'bookAuthors', 'bookSeries']

      res.setHeader('Content-Type', 'application/json')
      res.write('{"version":"1.0","exportedAt":"' + new Date().toISOString() + '","data":{')

      const counts = {}
      for (let i = 0; i < tables.length; i++) {
        if (i > 0) res.write(',')
        counts[tables[i]] = await this._streamTable(res, tables[i])
      }

      res.write('},"counts":' + JSON.stringify(counts) + '}')
      res.end()

      Logger.info(`[SyncController] Export complete (streaming): ${JSON.stringify(counts)}`)
    } catch (error) {
      Logger.error('[SyncController] Export failed:', error)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Export failed', message: error.message })
      } else {
        res.end()
      }
    }
  }

  /**
   * 导入媒体库数据
   * POST /api/sync/import
   *
   * 只导入媒体库相关数据，保留用户数据（用户、进度、播放列表等）
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async importLibraryData(req, res) {
    try {
      const importData = req.body

      if (!importData || !importData.data) {
        return res.status(400).json({ error: 'Invalid import data' })
      }

      Logger.info('[SyncController] Starting library data import...')
      Logger.info(`[SyncController] Import data version: ${importData.version}, exported at: ${importData.exportedAt}`)

      const { data } = importData
      const results = {
        libraries: { inserted: 0, updated: 0 },
        libraryFolders: { inserted: 0, updated: 0 },
        libraryItems: { inserted: 0, updated: 0 },
        books: { inserted: 0, updated: 0 },
        podcasts: { inserted: 0, updated: 0 },
        podcastEpisodes: { inserted: 0, updated: 0 },
        authors: { inserted: 0, updated: 0 },
        series: { inserted: 0, updated: 0 },
        bookAuthors: { inserted: 0, updated: 0 },
        bookSeries: { inserted: 0, updated: 0 }
      }

      const transaction = await Database.sequelize.transaction()

      try {
        // 1. 导入媒体库配置
        if (data.libraries?.length) {
          for (const library of data.libraries) {
            const [, created] = await Database.libraryModel.upsert(library, { transaction })
            results.libraries[created ? 'inserted' : 'updated']++
          }
        }

        // 2. 导入媒体库文件夹
        if (data.libraryFolders?.length) {
          for (const folder of data.libraryFolders) {
            const [, created] = await Database.libraryFolderModel.upsert(folder, { transaction })
            results.libraryFolders[created ? 'inserted' : 'updated']++
          }
        }

        // 3. 导入作者
        if (data.authors?.length) {
          for (const author of data.authors) {
            const [, created] = await Database.authorModel.upsert(author, { transaction })
            results.authors[created ? 'inserted' : 'updated']++
          }
        }

        // 4. 导入系列
        if (data.series?.length) {
          for (const s of data.series) {
            const [, created] = await Database.seriesModel.upsert(s, { transaction })
            results.series[created ? 'inserted' : 'updated']++
          }
        }

        // 5. 导入书籍
        if (data.books?.length) {
          for (const book of data.books) {
            const [, created] = await Database.bookModel.upsert(book, { transaction })
            results.books[created ? 'inserted' : 'updated']++
          }
        }

        // 6. 导入播客
        if (data.podcasts?.length) {
          for (const podcast of data.podcasts) {
            const [, created] = await Database.podcastModel.upsert(podcast, { transaction })
            results.podcasts[created ? 'inserted' : 'updated']++
          }
        }

        // 7. 导入播客剧集
        if (data.podcastEpisodes?.length) {
          for (const episode of data.podcastEpisodes) {
            const [, created] = await Database.podcastEpisodeModel.upsert(episode, { transaction })
            results.podcastEpisodes[created ? 'inserted' : 'updated']++
          }
        }

        // 8. 导入媒体项目
        if (data.libraryItems?.length) {
          for (const item of data.libraryItems) {
            const [, created] = await Database.libraryItemModel.upsert(item, { transaction })
            results.libraryItems[created ? 'inserted' : 'updated']++
          }
        }

        // 9. 导入书籍-作者关联
        if (data.bookAuthors?.length) {
          await Database.bookAuthorModel.destroy({ where: {}, transaction })
          for (const ba of data.bookAuthors) {
            await Database.bookAuthorModel.create(ba, { transaction })
            results.bookAuthors.inserted++
          }
        }

        // 10. 导入书籍-系列关联
        if (data.bookSeries?.length) {
          await Database.bookSeriesModel.destroy({ where: {}, transaction })
          for (const bs of data.bookSeries) {
            await Database.bookSeriesModel.create(bs, { transaction })
            results.bookSeries.inserted++
          }
        }

        await transaction.commit()

        Logger.info('[SyncController] Import complete:', results)
        Database.libraryFilterData = {}

        res.json({ success: true, message: 'Import completed successfully', results })
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    } catch (error) {
      Logger.error('[SyncController] Import failed:', error)
      res.status(500).json({ error: 'Import failed', message: error.message })
    }
  }

  /**
   * 获取同步状态/统计信息
   * GET /api/sync/status
   */
  async getSyncStatus(req, res) {
    try {
      const counts = {
        libraries: await Database.libraryModel.count(),
        libraryItems: await Database.libraryItemModel.count(),
        books: await Database.bookModel.count(),
        podcasts: await Database.podcastModel.count(),
        podcastEpisodes: await Database.podcastEpisodeModel.count(),
        authors: await Database.authorModel.count(),
        series: await Database.seriesModel.count(),
        users: await Database.userModel.count(),
        mediaProgresses: await Database.mediaProgressModel.count()
      }

      res.json({ status: 'ok', counts, timestamp: new Date().toISOString() })
    } catch (error) {
      Logger.error('[SyncController] Status check failed:', error)
      res.status(500).json({ error: 'Status check failed', message: error.message })
    }
  }
}

module.exports = new SyncController()
