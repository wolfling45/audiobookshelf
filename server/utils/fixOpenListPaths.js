/**
 * 修复数据库中错误的 OpenList 路径
 * 
 * 问题：之前的代码会将 "openlist:/path" 错误地转换为 "/app/openlist:/path"
 * 这个脚本会修复这些错误的路径
 * 
 * 使用方法：
 * node server/utils/fixOpenListPaths.js
 * 
 * 或在 Docker 中：
 * docker exec -it audiobookshelf_w-1 node server/utils/fixOpenListPaths.js
 */

const Path = require('path')
const { Sequelize } = require('sequelize')

// 设置环境变量
process.env.SOURCE = 'fixOpenListPaths'

// 初始化数据库
const Database = require('../Database')

async function fixOpenListPaths() {
  console.log('OpenList 路径修复工具')
  console.log('='.repeat(60))
  
  try {
    // 初始化数据库连接
    await Database.init()
    console.log('✅ 数据库连接成功')
    
    // 查找所有包含 "openlist:" 的文件夹路径
    const folders = await Database.libraryFolderModel.findAll()
    
    console.log(`\n找到 ${folders.length} 个书库文件夹`)
    console.log('-'.repeat(60))
    
    let fixedCount = 0
    let errorCount = 0
    
    for (const folder of folders) {
      const originalPath = folder.path
      
      // 检查是否是错误的 OpenList 路径格式
      // 错误格式: /app/openlist:/path 或 /some/path/openlist:/path
      const openlistMatch = originalPath.match(/^(.*)openlist:(.*)$/)
      
      if (openlistMatch && openlistMatch[1] && openlistMatch[1] !== '') {
        // 这是一个错误的路径，需要修复
        const correctPath = `openlist:${openlistMatch[2]}`
        
        console.log(`\n📁 文件夹 ID: ${folder.id}`)
        console.log(`   书库 ID: ${folder.libraryId}`)
        console.log(`   ❌ 错误路径: ${originalPath}`)
        console.log(`   ✅ 正确路径: ${correctPath}`)
        
        try {
          await folder.update({ path: correctPath })
          console.log(`   ✅ 已修复`)
          fixedCount++
        } catch (error) {
          console.log(`   ❌ 修复失败: ${error.message}`)
          errorCount++
        }
      } else if (originalPath.startsWith('openlist:')) {
        console.log(`\n📁 文件夹 ID: ${folder.id}`)
        console.log(`   书库 ID: ${folder.libraryId}`)
        console.log(`   ✅ 路径正确: ${originalPath}`)
      } else {
        // 本地路径，跳过
        console.log(`\n📁 文件夹 ID: ${folder.id}`)
        console.log(`   书库 ID: ${folder.libraryId}`)
        console.log(`   📂 本地路径: ${originalPath}`)
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('修复完成')
    console.log(`   修复成功: ${fixedCount}`)
    console.log(`   修复失败: ${errorCount}`)
    console.log(`   总计: ${folders.length}`)
    
    if (fixedCount > 0) {
      console.log('\n⚠️  请重启 Audiobookshelf 以应用更改')
    }
    
  } catch (error) {
    console.error('❌ 执行失败:', error)
    process.exit(1)
  }
  
  process.exit(0)
}

// 运行修复
fixOpenListPaths()
