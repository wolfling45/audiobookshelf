/**
 * ffprobe 封装 - 优化版
 * 支持精简模式和缓存
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const execPromise = promisify(exec)
const Logger = require('../Logger')
const scanConfig = require('../scanner/scanConfig')
const ProbeCache = require('../scanner/ProbeCache')

class Prober {
  constructor() {
    this.ffprobePath = 'ffprobe' // 或者从配置读取
  }
  
  /**
   * 超时包装器
   * @param {Promise} promise 
   * @param {number} timeout 
   * @returns {Promise}
   */
  withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Probe timeout')), timeout)
      )
    ])
  }
  
  /**
   * 重试包装器
   * @param {Function} fn 
   * @param {number} times 
   * @returns {Promise}
   */
  async withRetry(fn, times = 3) {
    let lastError
    for (let i = 0; i < times; i++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        if (i < times - 1) {
          Logger.debug(`[Prober] Retry ${i + 1}/${times - 1} after error: ${error.message}`)
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))) // 递增延迟
        }
      }
    }
    throw lastError
  }
  
  /**
   * 精简模式：只获取音频流信息和章节
   * @param {string} filepath 
   * @returns {Promise<Object>}
   */
  async probeMinimal(filepath) {
    const cmd = [
      this.ffprobePath,
      '-v', 'quiet',
      '-print_format', 'json',
      // 只获取必要的格式信息
      '-show_entries', 'format=duration,size,bit_rate',
      // 只获取必要的流信息
      '-show_entries', 'stream=codec_name,codec_type,sample_rate,channels,bit_rate,time_base',
      // 获取章节信息
      '-show_chapters',
      `"${filepath}"`
    ].join(' ')
    
    try {
      const { stdout } = await execPromise(cmd, {
        maxBuffer: 1024 * 1024 // 1MB buffer
      })
      
      const data = JSON.parse(stdout)
      
      // 转换为标准格式
      return this.transformMinimalData(data)
    } catch (error) {
      throw new Error(`ffprobe minimal failed: ${error.message}`)
    }
  }
  
  /**
   * 完整模式：获取所有信息（包括元数据标签）
   * @param {string} filepath 
   * @returns {Promise<Object>}
   */
  async probeFull(filepath) {
    const cmd = [
      this.ffprobePath,
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      `"${filepath}"`
    ].join(' ')
    
    try {
      const { stdout } = await execPromise(cmd, {
        maxBuffer: 2 * 1024 * 1024 // 2MB buffer
      })
      
      const data = JSON.parse(stdout)
      
      return this.transformFullData(data)
    } catch (error) {
      throw new Error(`ffprobe full failed: ${error.message}`)
    }
  }
  
  /**
   * 转换精简数据格式
   * @param {Object} data 
   * @returns {Object}
   */
  transformMinimalData(data) {
    const format = data.format || {}
    const streams = data.streams || []
    const audioStream = streams.find(s => s.codec_type === 'audio')
    const videoStream = streams.find(s => s.codec_type === 'video')
    
    return {
      format: format.format_name,
      duration: parseFloat(format.duration) || 0,
      size: parseInt(format.size) || 0,
      bit_rate: parseInt(format.bit_rate) || (audioStream ? parseInt(audioStream.bit_rate) : 0),
      audio_stream: audioStream ? {
        codec: audioStream.codec_name,
        sample_rate: parseInt(audioStream.sample_rate) || 0,
        channels: parseInt(audioStream.channels) || 0,
        bit_rate: parseInt(audioStream.bit_rate) || 0,
        time_base: audioStream.time_base
      } : null,
      video_stream: videoStream ? {
        codec: videoStream.codec_name
      } : null,
      chapters: this.transformChapters(data.chapters || []),
      tags: {} // 空标签，快速模式不读取
    }
  }
  
  /**
   * 转换完整数据格式
   * @param {Object} data 
   * @returns {Object}
   */
  transformFullData(data) {
    const format = data.format || {}
    const streams = data.streams || []
    const audioStream = streams.find(s => s.codec_type === 'audio')
    const videoStream = streams.find(s => s.codec_type === 'video')
    
    return {
      format: format.format_name,
      duration: parseFloat(format.duration) || 0,
      size: parseInt(format.size) || 0,
      bit_rate: parseInt(format.bit_rate) || (audioStream ? parseInt(audioStream.bit_rate) : 0),
      audio_stream: audioStream ? {
        codec: audioStream.codec_name,
        sample_rate: parseInt(audioStream.sample_rate) || 0,
        channels: parseInt(audioStream.channels) || 0,
        channel_layout: audioStream.channel_layout,
        bit_rate: parseInt(audioStream.bit_rate) || 0,
        time_base: audioStream.time_base,
        language: audioStream.tags?.language
      } : null,
      video_stream: videoStream ? {
        codec: videoStream.codec_name
      } : null,
      chapters: this.transformChapters(data.chapters || []),
      tags: this.transformTags(format.tags || {})
    }
  }
  
  /**
   * 转换章节格式
   * @param {Array} chapters 
   * @returns {Array}
   */
  transformChapters(chapters) {
    return chapters.map((ch, index) => ({
      id: index,
      start: parseFloat(ch.start_time) || 0,
      end: parseFloat(ch.end_time) || 0,
      title: ch.tags?.title || `Chapter ${index + 1}`
    }))
  }
  
  /**
   * 转换标签格式
   * @param {Object} tags 
   * @returns {Object}
   */
  transformTags(tags) {
    const normalized = {}
    
    // 标准化标签名称
    const tagMapping = {
      'title': 'tagTitle',
      'album': 'tagAlbum',
      'artist': 'tagArtist',
      'album_artist': 'tagAlbumArtist',
      'composer': 'tagComposer',
      'genre': 'tagGenre',
      'date': 'tagDate',
      'comment': 'tagComment',
      'description': 'tagDescription',
      'subtitle': 'tagSubtitle',
      'publisher': 'tagPublisher',
      'track': 'tagTrack',
      'disc': 'tagDisc',
      'series': 'tagSeries',
      'series-part': 'tagSeriesPart'
    }
    
    for (const [key, value] of Object.entries(tags)) {
      const normalizedKey = tagMapping[key.toLowerCase()] || key
      normalized[normalizedKey] = value
    }
    
    return normalized
  }
  
  /**
   * 主探测方法（带缓存和优化）
   * @param {string} filepath 
   * @returns {Promise<Object>}
   */
  async probe(filepath) {
    // 尝试从缓存读取
    const cached = await ProbeCache.get(filepath)
    if (cached) {
      return cached
    }
    
    // 决定使用精简还是完整模式
    const probeFunc = scanConfig.shouldUseMinimalProbe() 
      ? () => this.probeMinimal(filepath)
      : () => this.probeFull(filepath)
    
    // 带超时和重试的探测
    const probeWithProtection = () => this.withTimeout(
      this.withRetry(probeFunc, scanConfig.PROBE_RETRY_TIMES),
      scanConfig.PROBE_TIMEOUT
    )
    
    try {
      const result = await probeWithProtection()
      
      // 转换为标准 MediaProbeData 格式
      const probeData = {
        embeddedCoverArt: result.video_stream?.codec || null,
        format: result.format,
        duration: result.duration,
        size: result.size,
        audioStream: result.audio_stream,
        videoStream: result.video_stream,
        bitRate: result.bit_rate,
        codec: result.audio_stream?.codec,
        timeBase: result.audio_stream?.time_base,
        language: result.audio_stream?.language,
        channelLayout: result.audio_stream?.channel_layout,
        channels: result.audio_stream?.channels,
        sampleRate: result.audio_stream?.sample_rate,
        chapters: result.chapters,
        audioMetaTags: result.tags
      }
      
      // 存入缓存
      await ProbeCache.set(filepath, probeData)
      
      return probeData
    } catch (error) {
      Logger.error(`[Prober] Failed to probe "${filepath}":`, error.message)
      return {
        error: error.message
      }
    }
  }
  
  /**
   * 原始 probe（不经过优化，用于特殊需求）
   * @param {string} filepath 
   * @returns {Promise<Object>}
   */
  async rawProbe(filepath) {
    return this.probeFull(filepath)
  }
}

module.exports = new Prober()
