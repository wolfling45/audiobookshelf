const chai = require('chai')
const expect = chai.expect

describe('scanConfig', () => {
  let originalEnv

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = process.env.IGNORE_FILE_METADATA
    // 清除模块缓存以便重新加载
    delete require.cache[require.resolve('../../../server/utils/scanConfig')]
  })

  afterEach(() => {
    // 恢复原始环境变量
    if (originalEnv !== undefined) {
      process.env.IGNORE_FILE_METADATA = originalEnv
    } else {
      delete process.env.IGNORE_FILE_METADATA
    }
    // 清除模块缓存
    delete require.cache[require.resolve('../../../server/utils/scanConfig')]
  })

  describe('IGNORE_FILE_METADATA_CHANGES', () => {
    it('should be false by default', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')
      expect(scanConfig.IGNORE_FILE_METADATA_CHANGES).to.be.false
    })

    it('should be true when IGNORE_FILE_METADATA=true', () => {
      process.env.IGNORE_FILE_METADATA = 'true'
      const scanConfig = require('../../../server/utils/scanConfig')
      expect(scanConfig.IGNORE_FILE_METADATA_CHANGES).to.be.true
    })

    it('should be false when IGNORE_FILE_METADATA=false', () => {
      process.env.IGNORE_FILE_METADATA = 'false'
      const scanConfig = require('../../../server/utils/scanConfig')
      expect(scanConfig.IGNORE_FILE_METADATA_CHANGES).to.be.false
    })
  })

  describe('isLibraryFileMatch', () => {
    it('should match files by path', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const file1 = { metadata: { path: '/test/file.mp3' }, ino: '123' }
      const file2 = { metadata: { path: '/test/file.mp3' }, ino: '456' }

      expect(scanConfig.isLibraryFileMatch(file1, file2)).to.be.true
    })

    it('should match files by ino when paths differ (normal mode)', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const file1 = { metadata: { path: '/test/file1.mp3' }, ino: '123' }
      const file2 = { metadata: { path: '/test/file2.mp3' }, ino: '123' }

      expect(scanConfig.isLibraryFileMatch(file1, file2)).to.be.true
    })

    it('should NOT match files by ino when in ignore mode', () => {
      process.env.IGNORE_FILE_METADATA = 'true'
      const scanConfig = require('../../../server/utils/scanConfig')

      const file1 = { metadata: { path: '/test/file1.mp3' }, ino: '123' }
      const file2 = { metadata: { path: '/test/file2.mp3' }, ino: '123' }

      expect(scanConfig.isLibraryFileMatch(file1, file2)).to.be.false
    })
  })

  describe('hasLibraryFileChanged', () => {
    it('should detect path changes', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const existing = { metadata: { path: '/test/old.mp3', size: 1000 }, ino: '123' }
      const scanned = { metadata: { path: '/test/new.mp3', size: 1000 }, ino: '123' }

      expect(scanConfig.hasLibraryFileChanged(existing, scanned)).to.be.true
    })

    it('should detect size changes', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const existing = { metadata: { path: '/test/file.mp3', size: 1000 }, ino: '123' }
      const scanned = { metadata: { path: '/test/file.mp3', size: 2000 }, ino: '123' }

      expect(scanConfig.hasLibraryFileChanged(existing, scanned)).to.be.true
    })

    it('should detect ino changes in normal mode', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const existing = { metadata: { path: '/test/file.mp3', size: 1000 }, ino: '123' }
      const scanned = { metadata: { path: '/test/file.mp3', size: 1000 }, ino: '456' }

      expect(scanConfig.hasLibraryFileChanged(existing, scanned)).to.be.true
    })

    it('should NOT detect ino changes in ignore mode', () => {
      process.env.IGNORE_FILE_METADATA = 'true'
      const scanConfig = require('../../../server/utils/scanConfig')

      const existing = { metadata: { path: '/test/file.mp3', size: 1000 }, ino: '123' }
      const scanned = { metadata: { path: '/test/file.mp3', size: 1000 }, ino: '456' }

      expect(scanConfig.hasLibraryFileChanged(existing, scanned)).to.be.false
    })

    it('should detect mtime changes in normal mode', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const existing = { metadata: { path: '/test/file.mp3', size: 1000, mtimeMs: 1000 }, ino: '123' }
      const scanned = { metadata: { path: '/test/file.mp3', size: 1000, mtimeMs: 2000 }, ino: '123' }

      expect(scanConfig.hasLibraryFileChanged(existing, scanned)).to.be.true
    })

    it('should NOT detect mtime changes in ignore mode', () => {
      process.env.IGNORE_FILE_METADATA = 'true'
      const scanConfig = require('../../../server/utils/scanConfig')

      const existing = { metadata: { path: '/test/file.mp3', size: 1000, mtimeMs: 1000 }, ino: '123' }
      const scanned = { metadata: { path: '/test/file.mp3', size: 1000, mtimeMs: 2000 }, ino: '123' }

      expect(scanConfig.hasLibraryFileChanged(existing, scanned)).to.be.false
    })
  })

  describe('generatePathBasedIno', () => {
    it('should generate consistent ino for same path', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const path = '/test/audiobook/file.mp3'
      const ino1 = scanConfig.generatePathBasedIno(path)
      const ino2 = scanConfig.generatePathBasedIno(path)

      expect(ino1).to.equal(ino2)
      expect(ino1).to.match(/^path-/)
    })

    it('should generate different ino for different paths', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const ino1 = scanConfig.generatePathBasedIno('/test/file1.mp3')
      const ino2 = scanConfig.generatePathBasedIno('/test/file2.mp3')

      expect(ino1).to.not.equal(ino2)
    })
  })

  describe('getEffectiveIno', () => {
    it('should return original ino if available', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const result = scanConfig.getEffectiveIno('123', '/test/file.mp3')
      expect(result).to.equal('123')
    })

    it('should return path-based ino in ignore mode when original is null', () => {
      process.env.IGNORE_FILE_METADATA = 'true'
      const scanConfig = require('../../../server/utils/scanConfig')

      const result = scanConfig.getEffectiveIno(null, '/test/file.mp3')
      expect(result).to.match(/^path-/)
    })

    it('should return null in normal mode when original is null', () => {
      delete process.env.IGNORE_FILE_METADATA
      const scanConfig = require('../../../server/utils/scanConfig')

      const result = scanConfig.getEffectiveIno(null, '/test/file.mp3')
      expect(result).to.be.null
    })
  })
})
