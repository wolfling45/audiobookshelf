/**
 * server/utils/prober.js - 网盘优化版
 * 只读取音频文件头部（前 5MB），大幅减少网络传输
 */

const fs = require('fs').promises
const fsSync = require('fs')
const Path = require('path')
const os = require('os')
const { promisify } = require('util')
const { pipeline } = require('stream')
const pipelineAsync = promisify(pipeline)

const Logger = require('../Logger')
const { secondsToTimestamp } = require('./index')
const ProbeCache = require('../scanner/ProbeCache')
const scanConfig = require('../scanner/scanConfig')

class Prober {
  constructor() {
    this.FFProbePath = process.env.FFPROBE_PATH || 'ffprobe'
    this.TempProbeDir = Path.join(os.tmpdir(), 'abs-probe-cache')
  }

  /**
   * 确保临时目录存在
   */
  async ensureTempDir() {
    try {
      await fs.mkdir(this.TempProbeDir, { recursive: true })
    } catch (err) {
      Logger.error('[Prober] Failed to create temp dir:', err)
    }
  }

  /**
   * 🚀 核心优化：只读取文件前 N MB
   * 大多数音频格式的元数据都在文件头部
   */
  async readPartialFile(filePath, maxBytes = 5 * 1024 * 1024) {
    const tempFile = Path.join(
      this.TempProbeDir, 
      `${Path.basename(filePath)}_${Date.now()}.tmp`
    )
    
    try {
      await this.ensureTempDir()
      
      // 检查文件大小
      const stats = await fs.stat(filePath)
      const bytesToRead = Math.min(stats.size, maxBytes)
      
      Logger.debug(`[Prober] Reading first ${(bytesToRead / 1024 / 1024).toFixed(2)}MB of "${Path.basename(filePath)}"`)
      
      // 只读取前面部分
      const readStream = fsSync.createReadStream(filePath, {
        start: 0,
        end: bytesToRead - 1
      })
      
      const writeStream = fsSync.createWriteStream(tempFile)
      
      await pipelineAsync(readStream, writeStream)
      
      return tempFile
    } catch (err) {
      Logger.error(`[Prober] Failed to read partial file "${filePath}":`, err.message)
      throw err
    }
  }

  /**
   * 清理临时文件
   */
  async cleanupTempFile(tempFile) {
    try {
      if (tempFile && tempFile.includes(this.TempProbeDir)) {
        await fs.unlink(tempFile)
      }
    } catch (err) {
      // 忽略清理错误
    }
  }

  /**
   * 优化的 probe 方法
   */
  async probe(filePath) {
    // 1. 尝试从缓存获取
    if (scanConfig.shouldUseCache()) {
      const cached = await ProbeCache.get(filePath)
      if (cached) {
        return cached
      }
    }

    let tempFile = null
    let usePartialRead = scanConfig.USE_PARTIAL_READ !== false // 默认启用

    try {
      let targetFile = filePath

      // 2. 如果启用部分读取，只读取文件头部
      if (usePartialRead) {
        try {
          const maxBytes = scanConfig.PARTIAL_READ_SIZE || 5 * 1024 * 1024 // 默认 5MB
          tempFile = await this.readPartialFile(filePath, maxBytes)
          targetFile = tempFile
          Logger.debug(`[Prober] Using partial read for "${Path.basename(filePath)}"`)
        } catch (err) {
          Logger.warn(`[Prober] Partial read failed, falling back to full file: ${err.message}`)
          targetFile = filePath
          tempFile = null
        }
      }

      // 3. 运行 ffprobe（使用优化参数）
      const result = await this.runFFProbe(targetFile)

      // 4. 缓存结果
      if (scanConfig.shouldUseCache() && result) {
        await ProbeCache.set(filePath, result)
      }

      return result
    } catch (err) {
      Logger.error(`[Prober] Failed to probe "${filePath}":`, err.message)
      return { error: err.message }
    } finally {
      // 清理临时文件
      if (tempFile) {
        await this.cleanupTempFile(tempFile)
      }
    }
  }

  /**
   * 运行 ffprobe（优化参数）
   */
  async runFFProbe(filePath) {
    const { execFile } = require('child_process')
    const execFilePromise = promisify(execFile)

    // 优化的 ffprobe 参数
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      // 🚀 关键优化：限制分析时长和探测大小
      '-analyzeduration', scanConfig.FFPROBE_ANALYZE_DURATION || '5000000', // 5 秒
      '-probesize', scanConfig.FFPROBE_PROBE_SIZE || '5000000',             // 5MB
      filePath
    ]

    const timeout = scanConfig.PROBE_TIMEOUT || 30000

    try {
      const { stdout } = await execFilePromise(this.FFProbePath, args, {
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      })

      const rawProbeData = JSON.parse(stdout)
      return this.parseProbeData(rawProbeData)
    } catch (err) {
      throw new Error(`FFProbe failed: ${err.message}`)
    }
  }

  /**
   * 解析 ffprobe 输出
   */
  parseProbeData(rawData) {
    if (!rawData || !rawData.format) {
      throw new Error('Invalid ffprobe output')
    }

    const audioStream = rawData.streams?.find(s => s.codec_type === 'audio')
    const videoStream = rawData.streams?.find(s => s.codec_type === 'video')

    if (!audioStream) {
      throw new Error('No audio stream found')
    }

    // 提取基本信息
    const probeData = {
      format: rawData.format.format_name,
      duration: parseFloat(rawData.format.duration) || 0,
      size: parseInt(rawData.format.size) || 0,
      bit_rate: parseInt(rawData.format.bit_rate) || 0,
      
      audio_stream: {
        codec: audioStream.codec_name,
        bit_rate: parseInt(audioStream.bit_rate) || 0,
        channels: audioStream.channels,
        channel_layout: audioStream.channel_layout,
        sample_rate: audioStream.sample_rate,
        time_base: audioStream.time_base,
        language: audioStream.tags?.language
      },

      video_stream: videoStream ? {
        codec: videoStream.codec_name
      } : null,

      // 🚀 快速模式：跳过元数据标签
      tags: scanConfig.shouldSkipMetadata() ? {} : this.parseTags(rawData.format.tags),
      
      chapters: this.parseChapters(rawData.chapters)
    }

    return probeData
  }

  /**
   * 解析标签（可选）
   */
  parseTags(tags) {
    if (!tags || scanConfig.shouldSkipMetadata()) {
      return {}
    }

    // 标准化标签名称
    const normalized = {}
    for (const key in tags) {
      const lowerKey = key.toLowerCase()
      normalized[lowerKey] = tags[key]
    }

    return {
      tagTitle: normalized.title,
      tagAlbum: normalized.album,
      tagArtist: normalized.artist,
      tagAlbumArtist: normalized.album_artist || normalized['album-artist'],
      tagGenre: normalized.genre,
      tagDate: normalized.date || normalized.year,
      tagComposer: normalized.composer,
      tagComment: normalized.comment,
      tagDescription: normalized.description,
      tagPublisher: normalized.publisher,
      tagSubtitle: normalized.subtitle,
      tagTrack: normalized.track,
      tagDisc: normalized.disc,
      tagLanguage: normalized.language,
      tagISBN: normalized.isbn,
      tagASIN: normalized.asin,
      tagSeries: normalized.series,
      tagSeriesPart: normalized['series-part'] || normalized.series_part
    }
  }

  /**
   * 解析章节
   */
  parseChapters(chapters) {
    if (!chapters || !chapters.length) {
      return []
    }

    return chapters.map((ch, index) => ({
      id: index,
      start: parseFloat(ch.start_time) || 0,
      end: parseFloat(ch.end_time) || 0,
      title: ch.tags?.title || `Chapter ${index + 1}`
    }))
  }

  /**
   * 原始 probe 方法（用于测试）
   */
  async rawProbe(filePath) {
    return this.runFFProbe(filePath)
  }
}

// 定期清理临时文件（每小时）
setInterval(async () => {
  try {
    const tempDir = new Prober().TempProbeDir
    const files = await fs.readdir(tempDir)
    const now = Date.now()
    
    for (const file of files) {
      const filePath = Path.join(tempDir, file)
      const stats = await fs.stat(filePath)
      
      // 删除 1 小时前的临时文件
      if (now - stats.mtimeMs > 60 * 60 * 1000) {
        await fs.unlink(filePath)
      }
    }
  } catch (err) {
    // 忽略清理错误
  }
}, 60 * 60 * 1000) // 每小时执行一次

module.exports = new Prober()
