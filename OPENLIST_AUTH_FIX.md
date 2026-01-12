# OpenList 认证问题修复说明

## 问题

您遇到的 401 错误（"token is invalidated"）表明认证头格式可能不正确。

## 已完成的修改

1. **更新了 `server/libs/openlistClient.js`**
   - 移除了条件判断，直接使用 Token（不添加 Bearer 前缀）
   - 改进了错误日志，提供更详细的调试信息

2. **创建了认证测试脚本 `server/utils/testOpenListAuth.js`**
   - 自动测试 5 种不同的认证格式
   - 找出正确的认证方式

3. **创建了详细的故障排查文档 `docs/openlist-auth-troubleshooting.md`**
   - 包含所有可能的原因和解决方案
   - 提供手动测试命令

## 下一步操作

### 方法 1: 运行认证测试脚本（推荐）

```bash
# 在 Docker 容器中运行
docker exec -it audiobookshelf_w-1 sh -c "
export OPENLIST_URL=http://your-openlist-server:5244
export OPENLIST_TOKEN=your-full-token-here
node server/utils/testOpenListAuth.js
"
```

脚本会自动测试不同的认证格式，并告诉您哪种格式有效。

### 方法 2: 手动测试（如果方法 1 不可行）

使用 curl 测试不同的认证格式：

```bash
# 格式 1: 直接使用 Token（当前代码使用的格式）
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed..." \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'

# 格式 2: Bearer 格式
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: Bearer openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed..." \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'

# 格式 3: Token 头
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Token: openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed..." \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'
```

成功的响应应该包含 `"code": 200`。

### 方法 3: 重新生成 Token

如果所有格式都失败，可能是 Token 本身的问题：

1. 登录 OpenList 管理后台
2. 进入 **设置 -> 其它 -> 令牌**
3. 点击"重新生成"
4. 复制新的 Token（确保完整复制）
5. 更新环境变量并重启容器

## 如果找到了正确的格式

如果测试发现需要使用不同的认证格式，请告诉我结果，我会相应地修改代码。

例如，如果发现需要使用 Bearer 格式，我会修改 `server/libs/openlistClient.js` 中的这一行：

```javascript
// 当前（直接使用）
const authHeader = this.token

// 改为（Bearer 格式）
const authHeader = `Bearer ${this.token}`
```

## 常见问题

### Q: 为什么 /ping 成功但 /api/fs/list 失败？

A: `/ping` 是公共端点，不需要认证。而 `/api/fs/list` 需要认证，所以会检查 Token。

### Q: Token 格式是什么样的？

A: OpenList Token 格式：`openlist-{uuid}{random_string}`
   - 示例：`openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4edczMXctzT8V3xtNUKxY7xNRtJ2uIE0VHERNYutZFG53L15Pls2ll18UhNj8dzYNd2`
   - 长度：通常 80-100 个字符
   - 必须包含 `openlist-` 前缀

### Q: 如何确认 Token 是否正确？

A: 运行测试脚本或使用 curl 手动测试。如果所有格式都失败，说明 Token 可能无效。

## 需要帮助？

如果问题仍未解决，请提供：

1. 认证测试脚本的完整输出
2. OpenList 版本（从管理后台查看）
3. 使用的 Token 格式（前 20 个字符）
4. 完整的错误日志

## 参考文档

- [OpenList 认证问题排查指南](docs/openlist-auth-troubleshooting.md)
- [OpenList 快速开始指南](docs/openlist-quickstart.md)
- [OpenList API 文档](https://openlistteam.github.io/docs/guide/api/fs.html)
