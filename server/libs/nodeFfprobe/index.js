//
// node-ffprobe modified for audiobookshelf
// SOURCE: https://github.com/ListenerApproved/node-ffprobe
// MODIFIED: Added support for custom ffprobe arguments
//

const spawn = require('child_process').spawn

module.exports = (function () {
  /**
   * Probe media file with ffprobe
   * @param {string} file - File path to probe
   * @param {Object|Array} [options] - Custom options or arguments array
   * @param {number} [options.analyzeduration] - Analysis duration in microseconds
   * @param {number} [options.probesize] - Probe size in bytes
   * @param {boolean} [options.skipChapters] - Skip chapter scanning
   * @param {Array} [options.customArgs] - Custom ffprobe arguments
   * @returns {Promise<Object>} Probe result
   */
  function doProbe(file, options = null) {
    return new Promise((resolve, reject) => {
      let args = []

      // Handle different option formats
      if (Array.isArray(options)) {
        // If options is an array, use it directly as custom arguments
        args = options
      } else if (options && typeof options === 'object') {
        // Build arguments from options object
        if (options.customArgs) {
          args = options.customArgs
        } else {
          // Add analyzeduration and probesize if specified
          if (options.analyzeduration !== undefined) {
            args.push('-analyzeduration', options.analyzeduration.toString())
          }
          if (options.probesize !== undefined) {
            args.push('-probesize', options.probesize.toString())
          }

          // Standard arguments
          args.push(
            '-hide_banner',
            '-loglevel', 'fatal',
            '-show_error',
            '-show_format',
            '-show_streams',
            '-show_programs',
            '-show_private_data',
            '-print_format', 'json'
          )

          // Add chapters unless explicitly skipped
          if (!options.skipChapters) {
            args.push('-show_chapters')
          }
        }
      } else {
        // Default arguments (original behavior)
        args = [
          '-hide_banner',
          '-loglevel', 'fatal',
          '-show_error',
          '-show_format',
          '-show_streams',
          '-show_programs',
          '-show_chapters',
          '-show_private_data',
          '-print_format', 'json'
        ]
      }

      // Add file path at the end
      args.push(file)

      let proc = spawn(module.exports.FFPROBE_PATH || 'ffprobe', args)
      let probeData = []
      let errData = []
      let exitCode = null

      proc.stdout.setEncoding('utf8')
      proc.stderr.setEncoding('utf8')

      proc.stdout.on('data', function (data) { 
        probeData.push(data) 
      })
      
      proc.stderr.on('data', function (data) { 
        errData.push(data) 
      })

      proc.on('exit', code => { 
        exitCode = code 
      })
      
      proc.on('error', err => {
        reject(err)
      })
      
      proc.on('close', () => {
        if (exitCode !== 0 && errData.length) {
          const errorMessage = errData.join('')
          reject(new Error(`ffprobe exited with code ${exitCode}: ${errorMessage}`))
          return
        }

        try {
          const result = JSON.parse(probeData.join(''))
          resolve(result)
        } catch (err) {
          reject(new Error(`Failed to parse ffprobe output: ${err.message}`))
        }
      })
    })
  }

  return doProbe
})()
