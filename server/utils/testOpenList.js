/**
 * OpenList 客户端测试脚本
 * 
 * 使用方法：
 * 1. 设置环境变量：
 *    export OPENLIST_URL=http://your-openlist-server:5244
 *    export OPENLIST_TOKEN=your-token-here
 * 
 * 2. 运行测试：
 *    node server/utils/testOpenList.js /path/to/test
 */

const openlistClient = require('../libs/openlistClient')

async function testOpenList() {
  console.log('='.repeat(60))
  console.log('OpenList 客户端测试')
  console.log('='.repeat(60))
  
  // 检查配置
  console.log('\n1. 检查配置...')
  if (!openlistClient.isEnabled()) {
    console.error('❌ OpenList 客户端未配置')
    console.error('请设置环境变量：')
    console.error('  export OPENLIST_URL=http://your-server:5244')
    console.error('  export OPENLIST_TOKEN=your-token')
    process.exit(1)
  }
  console.log('✓ 配置已加载')
  console.log(`  URL: ${process.env.OPENLIST_URL}`)
  console.log(`  Token: ${process.env.OPENLIST_TOKEN?.substring(0, 10)}...`)
  
  // 测试连接
  console.log('\n2. 测试连接...')
  const connected = await openlistClient.testConnection()
  if (!connected) {
    console.error('❌ 连接失败')
    process.exit(1)
  }
  console.log('✓ 连接成功')
  
  // 获取站点设置
  console.log('\n3. 获取站点设置...')
  const settings = await openlistClient.getSettings()
  if (settings) {
    console.log('✓ 站点信息：')
    console.log(`  标题: ${settings.site_title}`)
    console.log(`  版本: ${settings.version}`)
  } else {
    console.warn('⚠ 无法获取站点设置')
  }
  
  // 测试路径（从命令行参数获取，默认为根目录）
  const testPath = process.argv[2] || '/'
  
  // 列出目录
  console.log(`\n4. 列出目录: ${testPath}`)
  const dirData = await openlistClient.listDirectory(testPath)
  if (!dirData) {
    console.error('❌ 无法列出目录')
    process.exit(1)
  }
  
  console.log(`✓ 找到 ${dirData.content?.length || 0} 个项目`)
  
  if (dirData.content && dirData.content.length > 0) {
    console.log('\n  前 10 个项目：')
    dirData.content.slice(0, 10).forEach((item, index) => {
      const type = item.is_dir ? '📁' : '📄'
      const size = item.is_dir ? '' : ` (${formatSize(item.size)})`
      console.log(`  ${index + 1}. ${type} ${item.name}${size}`)
    })
  }
  
  // 测试递归列出（只列出音频文件）
  console.log(`\n5. 递归扫描音频文件（最大深度 2）...`)
  const audioExtensions = ['.mp3', '.m4a', '.m4b', '.flac', '.aac', '.ogg', '.opus', '.wav']
  
  const audioFiles = await openlistClient.listDirectoryRecursive(testPath, {
    maxDepth: 2,
    filter: (file) => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      return audioExtensions.includes(ext)
    }
  })
  
  console.log(`✓ 找到 ${audioFiles.length} 个音频文件`)
  
  if (audioFiles.length > 0) {
    console.log('\n  前 5 个音频文件：')
    audioFiles.slice(0, 5).forEach((file, index) => {
      const normalized = openlistClient.normalizeFileInfo(file)
      console.log(`  ${index + 1}. ${file.name}`)
      console.log(`     路径: ${normalized.path}`)
      console.log(`     大小: ${formatSize(normalized.size)}`)
      console.log(`     修改时间: ${new Date(normalized.mtimeMs).toLocaleString()}`)
      console.log(`     伪 inode: ${normalized.ino}`)
    })
  }
  
  // 测试获取文件信息
  if (audioFiles.length > 0) {
    const testFile = audioFiles[0]
    console.log(`\n6. 获取文件详细信息: ${testFile.name}`)
    const fileInfo = await openlistClient.getFileInfo(testFile.path)
    if (fileInfo) {
      console.log('✓ 文件信息：')
      console.log(`  名称: ${fileInfo.name}`)
      console.log(`  大小: ${formatSize(fileInfo.size)}`)
      console.log(`  类型: ${fileInfo.type || 'unknown'}`)
      console.log(`  修改时间: ${fileInfo.modified}`)
      
      // 获取下载链接
      const downloadUrl = await openlistClient.getDownloadUrl(testFile.path)
      if (downloadUrl) {
        console.log(`  下载链接: ${downloadUrl.substring(0, 80)}...`)
      }
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✓ 所有测试完成')
  console.log('='.repeat(60))
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 运行测试
testOpenList().catch(error => {
  console.error('\n❌ 测试失败:', error.message)
  console.error(error.stack)
  process.exit(1)
})
