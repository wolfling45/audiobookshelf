const { DataTypes, Model } = require('sequelize')

class LibraryFolder extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.path
    /** @type {UUIDV4} */
    this.libraryId
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        path: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'libraryFolder'
      }
    )

    const { library } = sequelize.models
    library.hasMany(LibraryFolder, {
      onDelete: 'CASCADE'
    })
    LibraryFolder.belongsTo(library)
  }

  /**
   * TODO: Update to use new model
   */
  toOldJSON() {
    return {
      id: this.id,
      fullPath: this.path,
      libraryId: this.libraryId,
      addedAt: this.createdAt.valueOf()
    }
  }

  /**
   * Check if this folder is an OpenList path
   * @returns {boolean}
   */
  get isOpenList() {
    return this.path && this.path.startsWith('openlist:')
  }

  /**
   * Get normalized path (without openlist: prefix)
   * @returns {string}
   */
  get normalizedPath() {
    if (this.isOpenList) {
      // 移除 openlist: 前缀和所有斜杠
      let normalized = this.path.replace(/^openlist:\/*/i, '')
      // 确保以 / 开头
      if (!normalized.startsWith('/')) {
        normalized = '/' + normalized
      }
      return normalized
    }
    return this.path
  }
}

module.exports = LibraryFolder
