const Logger = require('../Logger')
const Database = require('../Database')

/**
 * 同步控制器
 * 用于本地服务器和 VPS 之间的媒体库数据同步
 *
 * 导出：导出媒体库相关表的数据
 * 导入：导入媒体库数据，保留用户数据（用户、进度等）
 */
class SyncController {
  constructor() {}

  /**
   * 导出媒体库数据
   * GET /api/sync/export
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async exportLibraryData(req, res) {
    try {
      Logger.info('[SyncController] Starting library data export...')

      // 导出媒体库配置
      const libraries = await Database.libraryModel.findAll({ raw: true })
      const libraryFolders = await Database.libraryFolderModel.findAll({ raw: true })

      // 导出媒体项目
      const libraryItems = await Database.libraryItemModel.findAll({ raw: true })
      const books = await Database.bookModel.findAll({ raw: true })
      const podcasts = await Database.podcastModel.findAll({ raw: true })
      const podcastEpisodes = await Database.podcastEpisodeModel.findAll({ raw: true })

      // 导出作者和系列
      const authors = await Database.authorModel.findAll({ raw: true })
      const series = await Database.seriesModel.findAll({ raw: true })

      // 导出关联表
      const bookAuthors = await Database.bookAuthorModel.findAll({ raw: true })
      const bookSeries = await Database.bookSeriesModel.findAll({ raw: true })

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        data: {
          libraries,
          libraryFolders,
          libraryItems,
          books,
          podcasts,
          podcastEpisodes,
          authors,
          series,
          bookAuthors,
          bookSeries
        },
        counts: {
          libraries: libraries.length,
          libraryFolders: libraryFolders.length,
          libraryItems: libraryItems.length,
          books: books.length,
          podcasts: podcasts.length,
          podcastEpisodes: podcastEpisodes.length,
          authors: authors.length,
          series: series.length,
          bookAuthors: bookAuthors.length,
          bookSeries: bookSeries.length
        }
      }

      Logger.info(`[SyncController] Export complete: ${libraryItems.length} library items, ${books.length} books, ${authors.length} authors`)

      res.json(exportData)
    } catch (error) {
      Logger.error('[SyncController] Export failed:', error)
      res.status(500).json({ error: 'Export failed', message: error.message })
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

      // 使用事务确保数据一致性
      const transaction = await Database.sequelize.transaction()

      try {
        // 1. 导入媒体库配置
        if (data.libraries?.length) {
          for (const library of data.libraries) {
            const [record, created] = await Database.libraryModel.upsert(library, { transaction })
            results.libraries[created ? 'inserted' : 'updated']++
          }
        }

        // 2. 导入媒体库文件夹
        if (data.libraryFolders?.length) {
          for (const folder of data.libraryFolders) {
            const [record, created] = await Database.libraryFolderModel.upsert(folder, { transaction })
            results.libraryFolders[created ? 'inserted' : 'updated']++
          }
        }

        // 3. 导入作者（先导入，因为 bookAuthors 依赖它）
        if (data.authors?.length) {
          for (const author of data.authors) {
            const [record, created] = await Database.authorModel.upsert(author, { transaction })
            results.authors[created ? 'inserted' : 'updated']++
          }
        }

        // 4. 导入系列（先导入，因为 bookSeries 依赖它）
        if (data.series?.length) {
          for (const s of data.series) {
            const [record, created] = await Database.seriesModel.upsert(s, { transaction })
            results.series[created ? 'inserted' : 'updated']++
          }
        }

        // 5. 导入书籍
        if (data.books?.length) {
          for (const book of data.books) {
            const [record, created] = await Database.bookModel.upsert(book, { transaction })
            results.books[created ? 'inserted' : 'updated']++
          }
        }

        // 6. 导入播客
        if (data.podcasts?.length) {
          for (const podcast of data.podcasts) {
            const [record, created] = await Database.podcastModel.upsert(podcast, { transaction })
            results.podcasts[created ? 'inserted' : 'updated']++
          }
        }

        // 7. 导入播客剧集
        if (data.podcastEpisodes?.length) {
          for (const episode of data.podcastEpisodes) {
            const [record, created] = await Database.podcastEpisodeModel.upsert(episode, { transaction })
            results.podcastEpisodes[created ? 'inserted' : 'updated']++
          }
        }

        // 8. 导入媒体项目
        if (data.libraryItems?.length) {
          for (const item of data.libraryItems) {
            const [record, created] = await Database.libraryItemModel.upsert(item, { transaction })
            results.libraryItems[created ? 'inserted' : 'updated']++
          }
        }

        // 9. 导入书籍-作者关联
        if (data.bookAuthors?.length) {
          // 先删除现有关联，再重新插入
          await Database.bookAuthorModel.destroy({ where: {}, transaction })
          for (const ba of data.bookAuthors) {
            await Database.bookAuthorModel.create(ba, { transaction })
            results.bookAuthors.inserted++
          }
        }

        // 10. 导入书籍-系列关联
        if (data.bookSeries?.length) {
          // 先删除现有关联，再重新插入
          await Database.bookSeriesModel.destroy({ where: {}, transaction })
          for (const bs of data.bookSeries) {
            await Database.bookSeriesModel.create(bs, { transaction })
            results.bookSeries.inserted++
          }
        }

        await transaction.commit()

        Logger.info('[SyncController] Import complete:', results)

        // 清空过滤器缓存，让系统在下次请求时重新加载
        Database.libraryFilterData = {}

        res.json({
          success: true,
          message: 'Import completed successfully',
          results
        })
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
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
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

      res.json({
        status: 'ok',
        counts,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      Logger.error('[SyncController] Status check failed:', error)
      res.status(500).json({ error: 'Status check failed', message: error.message })
    }
  }
}

module.exports = new SyncController()
