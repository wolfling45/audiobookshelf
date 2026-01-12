/**
 * OpenList 认证测试脚本
 * 测试不同的认证头格式
 */

const axios = require('axios')

const OPENLIST_URL = process.env.OPENLIST_URL
const OPENLIST_TOKEN = process.env.OPENLIST_TOKEN

if (!OPENLIST_URL || !OPENLIST_TOKEN) {
  console.error('❌ 请设置环境变量 OPENLIST_URL 和 OPENLIST_TOKEN')
  process.exit(1)
}

console.log('OpenList 认证测试')
console.log('='.repeat(60))
console.log(`URL: ${OPENLIST_URL}`)
console.log(`Token: ${OPENLIST_TOKEN.substring(0, 20)}...`)
console.log('='.repeat(60))
console.log()

// 测试不同的认证格式
const authFormats = [
  {
    name: '格式 1: Authorization: {token}',
    headers: { 'Authorization': OPENLIST_TOKEN }
  },
  {
    name: '格式 2: Authorization: Bearer {token}',
    headers: { 'Authorization': `Bearer ${OPENLIST_TOKEN}` }
  },
  {
    name: '格式 3: Token: {token}',
    headers: { 'Token': OPENLIST_TOKEN }
  },
  {
    name: '格式 4: X-Token: {token}',
    headers: { 'X-Token': OPENLIST_TOKEN }
  },
  {
    name: '格式 5: Alist-Token: {token}',
    headers: { 'Alist-Token': OPENLIST_TOKEN }
  }
]

async function testAuth(format) {
  try {
    console.log(`\n测试: ${format.name}`)
    console.log('-'.repeat(60))
    
    const response = await axios.post(
      `${OPENLIST_URL}/api/fs/list`,
      {
        path: '/',
        password: '',
        page: 1,
        per_page: 10,
        refresh: false
      },
      {
        headers: {
          ...format.headers,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )
    
    if (response.data?.code === 200) {
      console.log('✅ 成功！')
      console.log(`   状态码: ${response.status}`)
      console.log(`   响应码: ${response.data.code}`)
      console.log(`   消息: ${response.data.message}`)
      console.log(`   找到 ${response.data.data?.content?.length || 0} 个项目`)
      return true
    } else {
      console.log('❌ 失败')
      console.log(`   响应码: ${response.data?.code}`)
      console.log(`   消息: ${response.data?.message}`)
      return false
    }
  } catch (error) {
    console.log('❌ 失败')
    if (error.response) {
      console.log(`   HTTP 状态: ${error.response.status}`)
      console.log(`   响应码: ${error.response.data?.code}`)
      console.log(`   错误消息: ${error.response.data?.message}`)
    } else {
      console.log(`   错误: ${error.message}`)
    }
    return false
  }
}

async function main() {
  // 首先测试 /ping（不需要认证）
  console.log('步骤 1: 测试连接 (/ping)')
  console.log('-'.repeat(60))
  try {
    const pingResponse = await axios.get(`${OPENLIST_URL}/ping`, { timeout: 5000 })
    console.log(`✅ /ping 成功 (状态码: ${pingResponse.status})`)
  } catch (error) {
    console.log(`❌ /ping 失败: ${error.message}`)
    console.log('   无法连接到 OpenList 服务器')
    process.exit(1)
  }
  
  console.log()
  console.log('步骤 2: 测试不同的认证格式')
  console.log('='.repeat(60))
  
  let successCount = 0
  let successFormat = null
  
  for (const format of authFormats) {
    const success = await testAuth(format)
    if (success) {
      successCount++
      if (!successFormat) {
        successFormat = format
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500)) // 避免请求过快
  }
  
  console.log()
  console.log('='.repeat(60))
  console.log('测试总结')
  console.log('='.repeat(60))
  console.log(`成功的格式数量: ${successCount}/${authFormats.length}`)
  
  if (successFormat) {
    console.log()
    console.log('✅ 推荐使用的认证格式:')
    console.log(`   ${successFormat.name}`)
    console.log()
    console.log('请更新 server/libs/openlistClient.js 使用此格式')
  } else {
    console.log()
    console.log('❌ 所有认证格式都失败了')
    console.log()
    console.log('可能的原因:')
    console.log('1. Token 无效或已过期')
    console.log('2. Token 格式不正确')
    console.log('3. OpenList 服务器配置问题')
    console.log()
    console.log('请检查:')
    console.log('1. 在 OpenList 管理后台重新生成 Token')
    console.log('2. 确保复制了完整的 Token（包括 openlist- 前缀）')
    console.log('3. 检查 OpenList 日志查看详细错误信息')
  }
}

main().catch(error => {
  console.error('脚本执行失败:', error)
  process.exit(1)
})
