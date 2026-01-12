# 快速测试 OpenList 认证

## 一键测试命令

```bash
# 复制并运行（替换 URL 和 Token）
docker exec -it audiobookshelf_w-1 sh -c '
export OPENLIST_URL=http://your-openlist-server:5244
export OPENLIST_TOKEN=openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4edczMXctzT8V3xtNUKxY7xNRtJ2uIE0VHERNYutZFG53L15Pls2ll18UhNj8dzYNd2
node server/utils/testOpenListAuth.js
'
```

## 期望的输出

### 成功的情况

```
OpenList 认证测试
============================================================
URL: http://your-openlist-server:5244
Token: openlist-604f88cd-0b...
============================================================

步骤 1: 测试连接 (/ping)
------------------------------------------------------------
✅ /ping 成功 (状态码: 200)

步骤 2: 测试不同的认证格式
============================================================

测试: 格式 1: Authorization: {token}
------------------------------------------------------------
✅ 成功！
   状态码: 200
   响应码: 200
   消息: success
   找到 10 个项目

============================================================
测试总结
============================================================
成功的格式数量: 1/5

✅ 推荐使用的认证格式:
   格式 1: Authorization: {token}
```

### 失败的情况

```
============================================================
测试总结
============================================================
成功的格式数量: 0/5

❌ 所有认证格式都失败了

可能的原因:
1. Token 无效或已过期
2. Token 格式不正确
3. OpenList 服务器配置问题

请检查:
1. 在 OpenList 管理后台重新生成 Token
2. 确保复制了完整的 Token（包括 openlist- 前缀）
3. 检查 OpenList 日志查看详细错误信息
```

## 如果测试失败

### 步骤 1: 检查 Token

```bash
# 查看 Token 长度（应该是 80-100 个字符）
echo $OPENLIST_TOKEN | wc -c

# 查看 Token 前缀（应该是 openlist-）
echo $OPENLIST_TOKEN | cut -c1-9
```

### 步骤 2: 重新生成 Token

1. 登录 OpenList 管理后台
2. 设置 -> 其它 -> 令牌
3. 点击"重新生成"
4. 使用复制按钮复制（不要手动选择）
5. 更新环境变量

### 步骤 3: 手动测试

```bash
# 测试 1: 直接使用 Token
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: $OPENLIST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'

# 测试 2: Bearer 格式
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: Bearer $OPENLIST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'
```

成功的响应：`{"code":200,"message":"success",...}`

## 应用修复

测试成功后，重启应用：

```bash
docker-compose restart audiobookshelf
```

## 验证

```bash
# 查看日志
docker logs -f audiobookshelf_w-1 | grep OpenList

# 应该看到
# [OpenList] Client initialized with URL: ...
# [OpenList] Listing directory: /
# [OpenList] Found X items in /
```

## 需要帮助？

查看详细文档：
- `OPENLIST_TOKEN_FIX_CN.md` - 完整的修复说明（中文）
- `docs/openlist-auth-troubleshooting.md` - 故障排查指南
