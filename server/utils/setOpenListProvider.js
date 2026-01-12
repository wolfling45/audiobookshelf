/**
 * 设置书库为 OpenList 存储类型
 * 
 * 使用方法：
 * node server/utils/setOpenListProvider.js <library-id>
 * 
 * 或者查看所有书库：
 * node server/utils/setOpenListProvider.js --list
 */

const Database = require('../Database')
const Logger = require('../Logger')

async function listLibraries() {
  console.log('\n=== 所有书库 ===\n')
  
  const libraries = await Database.libraryModel.findAll({
    include: Database.libraryFolderModel
  })
  
  if (libraries.length === 0) {
    console.log('没有找到书库')
    return
  }
  
  libraries.forEach(lib => {
    console.log(`ID: ${lib.id}`)
    console.log(`名称: ${lib.name}`)
    console.log(`类型: ${lib.mediaType}`)
    console.log(`存储: ${lib.provider || 'local (默认)'}`)
    console.log(`文件夹:`)
    lib.libraryFolders.forEach(folder => {
      console.log(`  - ${folder.path}`)
    })
    console.log('')
  })
}

async function setProvider(libraryId, provider = 'openlist') {
  const library = await Database.libraryModel.findByPk(libraryId)
  
  if (!library) {
    console.error(`❌ 找不到 ID 为 "${libraryId}" 的书库`)
    process.exit(1)
  }
  
  console.log(`\n书库信息：`)
  console.log(`  名称: ${library.name}`)
  console.log(`  当前存储: ${library.provider || 'local (默认)'}`)
  console.log(`  新存储: ${provider}`)
  
  library.provider = provider
  await library.save()
  
  console.log(`\n✓ 已将书库 "${library.name}" 的存储类型设置为 "${provider}"`)
  console.log(`\n现在可以扫描此书库，系统会自动使用 OpenList API`)
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
使用方法：
  node server/utils/setOpenListProvider.js <library-id>     # 设置书库为 OpenList 存储
  node server/utils/setOpenListProvider.js --list           # 列出所有书库
  node server/utils/setOpenListProvider.js --help           # 显示帮助

示例：
  # 1. 列出所有书库，找到要设置的书库 ID
  node server/utils/setOpenListProvider.js --list
  
  # 2. 设置指定书库为 OpenList 存储
  node server/utils/setOpenListProvider.js abc-123-def-456
  
  # 3. 恢复为本地存储
  node server/utils/setOpenListProvider.js abc-123-def-456 local

注意：
  - 设置为 OpenList 后，路径会被识别为 OpenList 路径
  - 不需要在路径前添加 openlist:// 前缀
  - 确保已配置 OPENLIST_URL 和 OPENLIST_TOKEN 环境变量
`)
    process.exit(0)
  }
  
  try {
    // 初始化数据库
    await Database.init()
    
    if (args[0] === '--list' || args[0] === '-l') {
      await listLibraries()
    } else {
      const libraryId = args[0]
      const provider = args[1] || 'openlist'
      await setProvider(libraryId, provider)
    }
    
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 错误:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 运行
main()
