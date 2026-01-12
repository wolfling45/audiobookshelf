# OpenList Token 认证问题修复

## 问题分析

您遇到的问题：
- `/ping` 端点返回 200 OK ✅
- `/api/fs/list` 端点返回 401 错误："token is invalidated" ❌

这说明：
1. OpenList 服务器连接正常
2. Token 认证有问题

## 根本原因

OpenList/AList API 的认证头格式可能与我们当前使用的格式不匹配。不同版本的 OpenList 可能期望不同的认证格式。

## 已完成的修复

### 1. 修改了认证逻辑 (`server/libs/openlistClient.js`)

**之前的代码：**
```javascript
// 如果 token 以 openlist- 开头，直接使用；否则加 Bearer 前缀
const authHeader = this.token.startsWith('openlist-') ? this.token : `Bearer ${this.token}`
```

**修改后：**
```javascript
// 直接使用 token，不加任何前缀
const authHeader = this.token
```

**原因：** 根据 OpenList API 文档，Token 应该直接放在 `Authorization` 头中。

### 2. 创建了认证测试工具 (`server/utils/testOpenListAuth.js`)

这个脚本会自动测试 5 种不同的认证格式：

1. `Authorization: {token}` （当前使用）
2. `Authorization: Bearer {token}`
3. `Token: {token}`
4. `X-Token: {token}`
5. `Alist-Token: {token}`

### 3. 改进了错误日志

现在当出现 401 错误时，会显示更详细的信息：
- 当前使用的 Token 格式
- 可能的原因
- 解决建议

### 4. 创建了详细的故障排查文档

- `docs/openlist-auth-troubleshooting.md` - 完整的故障排查指南
- `OPENLIST_AUTH_FIX.md` - 快速修复说明

## 如何测试

### 方法 1: 使用认证测试脚本（推荐）

```bash
# 进入 Docker 容器
docker exec -it audiobookshelf_w-1 sh

# 设置环境变量（替换为您的实际值）
export OPENLIST_URL=http://your-openlist-server:5244
export OPENLIST_TOKEN=openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4edczMXctzT8V3xtNUKxY7xNRtJ2uIE0VHERNYutZFG53L15Pls2ll18UhNj8dzYNd2

# 运行测试
node server/utils/testOpenListAuth.js
```

脚本会输出类似这样的结果：

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

测试: 格式 2: Authorization: Bearer {token}
------------------------------------------------------------
❌ 失败
   HTTP 状态: 401
   错误消息: token is invalidated

...

============================================================
测试总结
============================================================
成功的格式数量: 1/5

✅ 推荐使用的认证格式:
   格式 1: Authorization: {token}

请更新 server/libs/openlistClient.js 使用此格式
```

### 方法 2: 手动测试

如果无法运行脚本，可以使用 curl 手动测试：

```bash
# 测试格式 1（当前代码使用的格式）
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed..." \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'

# 如果失败，尝试格式 2
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: Bearer openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed..." \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'
```

成功的响应应该是：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "content": [...],
    "total": 10
  }
}
```

### 方法 3: 重新生成 Token

如果所有格式都失败，可能是 Token 本身有问题：

1. 登录 OpenList 管理后台
2. 进入 **设置 -> 其它 -> 令牌**
3. 点击"重新生成"按钮
4. **使用复制按钮**复制新 Token（不要手动选择）
5. 确保复制了完整的 Token，包括 `openlist-` 前缀
6. 更新 Docker Compose 或环境变量中的 `OPENLIST_TOKEN`
7. 重启容器：
   ```bash
   docker-compose restart audiobookshelf
   ```

## 重启应用以应用修改

修改代码后需要重启：

```bash
# 如果使用 Docker Compose
docker-compose restart audiobookshelf

# 或者重新构建
docker-compose up -d --build
```

## 验证修复

重启后，尝试在 UI 中浏览 OpenList 文件夹：

1. 登录 Audiobookshelf
2. 进入"书库"页面
3. 点击"添加书库"
4. 点击"浏览 OpenList"按钮
5. 应该能看到 OpenList 中的文件夹列表

查看日志确认：
```bash
docker logs -f audiobookshelf_w-1 | grep OpenList
```

应该看到类似这样的日志：
```
[OpenList] Client initialized with URL: http://...
[OpenList] Listing directory: /
[OpenList] Found 5 items in /
```

## 如果问题仍未解决

请提供以下信息：

1. **认证测试脚本的完整输出**
   ```bash
   node server/utils/testOpenListAuth.js > auth-test-result.txt 2>&1
   ```

2. **OpenList 版本**
   ```bash
   curl http://your-openlist-server:5244/api/public/settings | jq '.data.version'
   ```

3. **Token 格式**（前 20 个字符）
   ```bash
   echo $OPENLIST_TOKEN | cut -c1-20
   ```

4. **完整的错误日志**
   ```bash
   docker logs audiobookshelf_w-1 2>&1 | grep -A 5 -B 5 "401"
   ```

5. **网络配置**
   - OpenList 和 Audiobookshelf 是否在同一 Docker 网络？
   - 是否使用了反向代理（nginx, traefik 等）？
   - 使用的是内网地址还是公网地址？

## Token 格式说明

正确的 OpenList Token 格式：

```
openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4edczMXctzT8V3xtNUKxY7xNRtJ2uIE0VHERNYutZFG53L15Pls2ll18UhNj8dzYNd2
```

特点：
- ✅ 以 `openlist-` 开头
- ✅ 包含 UUID 部分（36 个字符）
- ✅ 包含随机字符串部分
- ✅ 总长度约 80-100 个字符
- ❌ 不包含空格、换行符
- ❌ 不包含引号

## 可能需要的代码调整

如果测试发现需要使用不同的认证格式，我可以相应修改代码。

例如，如果需要使用 Bearer 格式：

```javascript
// 在 server/libs/openlistClient.js 的 constructor 中
const authHeader = `Bearer ${this.token}`
```

或者使用自定义头：

```javascript
// 在 server/libs/openlistClient.js 的 constructor 中
this.client = axios.create({
  baseURL: this.baseURL,
  timeout: 30000,
  headers: {
    'Token': this.token,  // 使用 Token 头而不是 Authorization
    'Content-Type': 'application/json'
  }
})
```

## 参考资料

- [OpenList API 文档](https://openlistteam.github.io/docs/guide/api/fs.html)
- [认证问题排查指南](docs/openlist-auth-troubleshooting.md)
- [快速开始指南](docs/openlist-quickstart.md)

## 总结

1. ✅ 修改了认证逻辑，直接使用 Token（不加 Bearer 前缀）
2. ✅ 创建了自动测试工具来诊断问题
3. ✅ 改进了错误日志
4. ✅ 创建了详细的故障排查文档

**下一步：** 请运行认证测试脚本，并告诉我结果。根据测试结果，我可以进一步调整代码。
