#!/bin/bash
# ============================================================
# ABS 媒体库同步脚本（SQLite 直接同步方案）
# 本地扫描服务器 → VPS 播放服务器
#
# 同步内容：数据库（保留VPS用户数据）+ metadata目录
# ============================================================

# ===== 配置 =====
VPS_USER="root"
VPS_HOST="your-vps-ip"
VPS_KEY="/path/to/your/private_key"                               # SSH 私钥路径
VPS_CONTAINER="audiobookshelf"                                    # VPS 上的容器名
VPS_DB_PATH="/home/audiobookshelf_w/config/absdatabase.sqlite"    # VPS 宿主机数据库路径
LOCAL_DB_PATH="/path/to/local/config/absdatabase.sqlite"          # 本地宿主机数据库路径
LOCAL_METADATA="/path/to/local/metadata"                          # 本地 metadata 目录
VPS_METADATA="/home/audiobookshelf_w/metadata"                    # VPS metadata 目录

# 需要在 VPS 上保留的用户数据表
USER_TABLES="users sessions apiKeys devices mediaProgresses playbackSessions collections collectionBooks playlists playlistMediaItems feeds feedEpisodes mediaItemShares"

# SSH/rsync 通用参数
SSH_OPTS="-i ${VPS_KEY} -o StrictHostKeyChecking=no"
SSH="ssh ${SSH_OPTS} ${VPS_USER}@${VPS_HOST}"
RSYNC_SSH="ssh ${SSH_OPTS}"

# ===== 颜色 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ABS 媒体库同步开始（SQLite方案）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# ===== 步骤 1: 停止 VPS 容器 =====
echo -e "${YELLOW}[1/6] 停止 VPS 容器...${NC}"
${SSH} "docker stop ${VPS_CONTAINER}"
if [ $? -ne 0 ]; then
  echo -e "${RED}错误: 无法停止 VPS 容器${NC}"
  exit 1
fi
echo -e "${GREEN}VPS 容器已停止${NC}"
echo ""

# ===== 步骤 2: 备份 VPS 用户数据 =====
echo -e "${YELLOW}[2/6] 备份 VPS 用户数据...${NC}"
BACKUP_SQL="/tmp/abs_user_backup.sql"

DUMP_CMD=""
for TABLE in ${USER_TABLES}; do
  DUMP_CMD="${DUMP_CMD}.dump ${TABLE}\n"
done

${SSH} "echo -e '${DUMP_CMD}' | sqlite3 '${VPS_DB_PATH}' > '${BACKUP_SQL}' 2>/dev/null"
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}警告: 部分表可能不存在（首次同步时正常）${NC}"
fi
echo -e "${GREEN}用户数据已备份${NC}"
echo ""

# ===== 步骤 3: 同步数据库文件 =====
echo -e "${YELLOW}[3/6] 同步数据库文件到 VPS...${NC}"
rsync -avz -e "${RSYNC_SSH}" "${LOCAL_DB_PATH}" "${VPS_USER}@${VPS_HOST}:${VPS_DB_PATH}"
if [ $? -ne 0 ]; then
  echo -e "${RED}错误: 数据库同步失败${NC}"
  ${SSH} "docker start ${VPS_CONTAINER}"
  exit 1
fi
echo -e "${GREEN}数据库同步完成${NC}"
echo ""

# ===== 步骤 4: 恢复 VPS 用户数据 =====
echo -e "${YELLOW}[4/6] 恢复 VPS 用户数据...${NC}"

DELETE_CMD=""
for TABLE in ${USER_TABLES}; do
  DELETE_CMD="${DELETE_CMD}DELETE FROM ${TABLE};\n"
done

${SSH} "echo -e '${DELETE_CMD}' | sqlite3 '${VPS_DB_PATH}' 2>/dev/null"
${SSH} "sqlite3 '${VPS_DB_PATH}' < '${BACKUP_SQL}' 2>/dev/null"

if [ $? -ne 0 ]; then
  echo -e "${YELLOW}警告: 用户数据恢复可能部分失败，请检查${NC}"
else
  echo -e "${GREEN}用户数据恢复完成${NC}"
fi
echo ""

# ===== 步骤 5: 同步 metadata 目录 =====
echo -e "${YELLOW}[5/6] 同步 metadata 目录...${NC}"
rsync -avz --delete --exclude='backups/' \
  -e "${RSYNC_SSH}" \
  "${LOCAL_METADATA}/" "${VPS_USER}@${VPS_HOST}:${VPS_METADATA}/"
if [ $? -eq 0 ]; then
  echo -e "${GREEN}metadata 同步完成${NC}"
else
  echo -e "${YELLOW}警告: metadata 同步可能部分失败${NC}"
fi
echo ""

# ===== 步骤 6: 启动 VPS 容器 =====
echo -e "${YELLOW}[6/6] 启动 VPS 容器...${NC}"
${SSH} "docker start ${VPS_CONTAINER}"
if [ $? -ne 0 ]; then
  echo -e "${RED}错误: 无法启动 VPS 容器${NC}"
  exit 1
fi
echo -e "${GREEN}VPS 容器已启动${NC}"
echo ""

# ===== 清理 =====
${SSH} "rm -f '${BACKUP_SQL}'"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}同步完成!${NC}"
echo -e "${GREEN}========================================${NC}"
