#!/bin/bash

# OpenList 集成 - Docker 管理脚本
# 用于在 Docker 环境中管理 OpenList 书库

set -e

CONTAINER_NAME="audiobookshelf"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查容器是否运行
check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_error "容器 '${CONTAINER_NAME}' 未运行"
        echo "请先启动容器或修改脚本中的 CONTAINER_NAME 变量"
        exit 1
    fi
}

# 列出所有书库
list_libraries() {
    print_info "列出所有书库..."
    docker exec -i ${CONTAINER_NAME} node server/utils/setOpenListProvider.js --list
}

# 设置书库为 OpenList 存储
set_openlist() {
    local library_id=$1
    if [ -z "$library_id" ]; then
        print_error "请提供书库 ID"
        echo "使用方法: $0 set <library-id>"
        exit 1
    fi
    
    print_info "设置书库 ${library_id} 为 OpenList 存储..."
    docker exec -i ${CONTAINER_NAME} node server/utils/setOpenListProvider.js "$library_id"
}

# 恢复为本地存储
set_local() {
    local library_id=$1
    if [ -z "$library_id" ]; then
        print_error "请提供书库 ID"
        echo "使用方法: $0 unset <library-id>"
        exit 1
    fi
    
    print_info "恢复书库 ${library_id} 为本地存储..."
    docker exec -i ${CONTAINER_NAME} node server/utils/setOpenListProvider.js "$library_id" local
}

# 测试 OpenList 连接
test_connection() {
    local path=${1:-/}
    print_info "测试 OpenList 连接..."
    docker exec -i ${CONTAINER_NAME} node server/utils/testOpenList.js "$path"
}

# 查看日志
view_logs() {
    print_info "查看 OpenList 相关日志..."
    docker logs ${CONTAINER_NAME} 2>&1 | grep -E "OpenList|LibraryScanner" | tail -50
}

# 查看环境变量
check_env() {
    print_info "检查 OpenList 环境变量..."
    echo ""
    echo "OPENLIST_URL:"
    docker exec -i ${CONTAINER_NAME} sh -c 'echo $OPENLIST_URL'
    echo ""
    echo "OPENLIST_TOKEN:"
    docker exec -i ${CONTAINER_NAME} sh -c 'echo $OPENLIST_TOKEN | cut -c1-20'...
    echo ""
    echo "IGNORE_FILE_METADATA:"
    docker exec -i ${CONTAINER_NAME} sh -c 'echo $IGNORE_FILE_METADATA'
    echo ""
    echo "FAST_SCAN_MODE:"
    docker exec -i ${CONTAINER_NAME} sh -c 'echo $FAST_SCAN_MODE'
}

# 直接修改数据库（SQLite）
db_set_provider() {
    local library_id=$1
    local provider=${2:-openlist}
    
    if [ -z "$library_id" ]; then
        print_error "请提供书库 ID"
        echo "使用方法: $0 db-set <library-id> [provider]"
        exit 1
    fi
    
    print_info "通过 SQL 设置书库 ${library_id} 的 provider 为 ${provider}..."
    
    docker exec -i ${CONTAINER_NAME} sqlite3 /config/absdatabase.sqlite <<EOF
UPDATE libraries SET provider = '${provider}' WHERE id = '${library_id}';
SELECT id, name, provider FROM libraries WHERE id = '${library_id}';
EOF
    
    print_info "完成！请重启容器使更改生效："
    echo "  docker restart ${CONTAINER_NAME}"
}

# 查看数据库中的书库
db_list() {
    print_info "从数据库查询书库..."
    docker exec -i ${CONTAINER_NAME} sqlite3 /config/absdatabase.sqlite <<EOF
.headers on
.mode column
SELECT id, name, mediaType, provider FROM libraries;
EOF
}

# 显示帮助
show_help() {
    cat << EOF
OpenList 集成 - Docker 管理脚本

使用方法:
  $0 <command> [options]

命令:
  list                    列出所有书库
  set <library-id>        设置书库为 OpenList 存储
  unset <library-id>      恢复书库为本地存储
  test [path]             测试 OpenList 连接（默认路径: /）
  logs                    查看 OpenList 相关日志
  env                     检查环境变量配置
  db-list                 从数据库查询书库
  db-set <id> [provider]  直接修改数据库（需要重启）
  help                    显示此帮助信息

示例:
  # 1. 检查环境变量
  $0 env

  # 2. 测试 OpenList 连接
  $0 test /115/audiobook3

  # 3. 列出所有书库
  $0 list

  # 4. 设置书库为 OpenList 存储
  $0 set abc-123-def-456

  # 5. 查看日志
  $0 logs

  # 6. 直接修改数据库（快速方法）
  $0 db-set abc-123-def-456 openlist
  docker restart ${CONTAINER_NAME}

注意:
  - 确保容器名称正确（当前: ${CONTAINER_NAME}）
  - 使用 db-set 命令后需要重启容器
  - 修改前建议备份数据库

EOF
}

# 主函数
main() {
    local command=${1:-help}
    
    case $command in
        list)
            check_container
            list_libraries
            ;;
        set)
            check_container
            set_openlist "$2"
            ;;
        unset)
            check_container
            set_local "$2"
            ;;
        test)
            check_container
            test_connection "$2"
            ;;
        logs)
            view_logs
            ;;
        env)
            check_container
            check_env
            ;;
        db-list)
            check_container
            db_list
            ;;
        db-set)
            check_container
            db_set_provider "$2" "$3"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
