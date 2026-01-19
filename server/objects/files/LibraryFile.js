const Path = require('path')
const { getFileTimestampsWithIno, filePathToPOSIX } = require('../../utils/fileUtils')
const globals = require('../../utils/globals')
const FileMetadata = require('../metadata/FileMetadata')

class LibraryFile {
  constructor(file) {
    this.ino = null
    this.metadata = null
    this.isSupplementary = null
    this.addedAt = null
    this.updatedAt = null

    if (file) {
      this.construct(file)
    }
  }

  construct(file) {
    this.ino = file.ino
    this.metadata = new FileMetadata(file.metadata)
    this.isSupplementary = file.isSupplementary === undefined ? null : file.isSupplementary
    this.isOpenList = file.isOpenList || false
    this.addedAt = file.addedAt
    this.updatedAt = file.updatedAt
  }

  toJSON() {
    return {
      ino: this.ino,
      metadata: this.metadata.toJSON(),
      isSupplementary: this.isSupplementary,
      isOpenList: this.isOpenList || false,
      addedAt: this.addedAt,
      updatedAt: this.updatedAt,
      fileType: this.fileType
    }
  }

  clone() {
    return new LibraryFile(this.toJSON())
  }

  get fileType() {
    if (globals.SupportedImageTypes.includes(this.metadata.format)) return 'image'
    if (globals.SupportedAudioTypes.includes(this.metadata.format)) return 'audio'
    if (globals.SupportedEbookTypes.includes(this.metadata.format)) return 'ebook'
    if (globals.TextFileTypes.includes(this.metadata.format)) return 'text'
    if (globals.MetadataFileTypes.includes(this.metadata.format)) return 'metadata'
    return 'unknown'
  }

  get isMediaFile() {
    return this.fileType === 'audio' || this.fileType === 'ebook'
  }

  get isEBookFile() {
    return this.fileType === 'ebook'
  }

  get isOPFFile() {
    return this.metadata.ext === '.opf'
  }

  async setDataFromPath(path, relPath, isOpenList = false) {
    var fileTsData = await getFileTimestampsWithIno(path, isOpenList)
    var fileMetadata = new FileMetadata()
    fileMetadata.setData(fileTsData)
    fileMetadata.filename = Path.basename(relPath)
    fileMetadata.path = filePathToPOSIX(path)
    fileMetadata.relPath = filePathToPOSIX(relPath)
    fileMetadata.ext = Path.extname(relPath)
    this.ino = fileTsData ? fileTsData.ino : null
    this.metadata = fileMetadata
    this.isOpenList = isOpenList  // 保存标志以便后续使用
    this.addedAt = Date.now()
    this.updatedAt = Date.now()
  }
}
module.exports = LibraryFile
