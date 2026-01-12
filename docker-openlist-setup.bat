@echo off
REM OpenList 集成 - Docker 管理脚本 (Windows 版本)
REM 用于在 Docker 环境中管理 OpenList 书库

setlocal enabledelayedexpansion

set CONTAINER_NAME=audiobookshelf

if "%1"=="" goto :help
if "%1"=="help" goto :help
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help

REM 检查容器是否运行
docker ps --format "{{.Names}}" | findstr /x "%CONTAINER_NAME%" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 容器 '%CONTAINER_NAME%' 未运行
    echo 请先启动容器或修改脚本中的 CONTAINER_NAME 变量
    exit /b 1
)

if "%1"=="list" goto :list
if "%1"=="set" goto :set
if "%1"=="unset" goto :unset
if "%1"=="test" goto :test
if "%1"=="logs" goto :logs
if "%1"=="env" goto :env
if "%1"=="db-list" goto :db_list
if "%1"=="db-set" goto :db_set

echo [ERROR] 未知命令: %1
echo.
goto :help

:list
echo [INFO] 列出所有书库...
docker exec -i %CONTAINER_NAME% node server/utils/setOpenListProvider.js --list
goto :end

:set
if "%2"=="" (
    echo [ERROR] 请提供书库 ID
    echo 使用方法: %0 set ^<library-id^>
    exit /b 1
)
echo [INFO] 设置书库 %2 为 OpenList 存储...
docker exec -i %CONTAINER_NAME% node server/utils/setOpenListProvider.js %2
goto :end

:unset
if "%2"=="" (
    echo [ERROR] 请提供书库 ID
    echo 使用方法: %0 unset ^<library-id^>
    exit /b 1
)
echo [INFO] 恢复书库 %2 为本地存储...
docker exec -i %CONTAINER_NAME% node server/utils/setOpenListProvider.js %2 local
goto :end

:test
set TEST_PATH=%2
if "%TEST_PATH%"=="" set TEST_PATH=/
echo [INFO] 测试 OpenList 连接...
docker exec -i %CONTAINER_NAME% node server/utils/testOpenList.js %TEST_PATH%
goto :end

:logs
echo [INFO] 查看 OpenList 相关日志...
docker logs %CONTAINER_NAME% 2>&1 | findstr /C:"OpenList" /C:"LibraryScanner"
goto :end

:env
echo [INFO] 检查 OpenList 环境变量...
echo.
echo OPENLIST_URL:
docker exec -i %CONTAINER_NAME% sh -c "echo $OPENLIST_URL"
echo.
echo OPENLIST_TOKEN:
docker exec -i %CONTAINER_NAME% sh -c "echo $OPENLIST_TOKEN | cut -c1-20"
echo ...
echo.
echo IGNORE_FILE_METADATA:
docker exec -i %CONTAINER_NAME% sh -c "echo $IGNORE_FILE_METADATA"
echo.
echo FAST_SCAN_MODE:
docker exec -i %CONTAINER_NAME% sh -c "echo $FAST_SCAN_MODE"
goto :end

:db_list
echo [INFO] 从数据库查询书库...
docker exec -i %CONTAINER_NAME% sqlite3 /config/absdatabase.sqlite ".headers on" ".mode column" "SELECT id, name, mediaType, provider FROM libraries;"
goto :end

:db_set
if "%2"=="" (
    echo [ERROR] 请提供书库 ID
    echo 使用方法: %0 db-set ^<library-id^> [provider]
    exit /b 1
)
set PROVIDER=%3
if "%PROVIDER%"=="" set PROVIDER=openlist
echo [INFO] 通过 SQL 设置书库 %2 的 provider 为 %PROVIDER%...
docker exec -i %CONTAINER_NAME% sqlite3 /config/absdatabase.sqlite "UPDATE libraries SET provider = '%PROVIDER%' WHERE id = '%2'; SELECT id, name, provider FROM libraries WHERE id = '%2';"
echo.
echo [INFO] 完成！请重启容器使更改生效：
echo   docker restart %CONTAINER_NAME%
goto :end

:help
echo OpenList 集成 - Docker 管理脚本 (Windows 版本)
echo.
echo 使用方法:
echo   %0 ^<command^> [options]
echo.
echo 命令:
echo   list                    列出所有书库
echo   set ^<library-id^>        设置书库为 OpenList 存储
echo   unset ^<library-id^>      恢复书库为本地存储
echo   test [path]             测试 OpenList 连接（默认路径: /）
echo   logs                    查看 OpenList 相关日志
echo   env                     检查环境变量配置
echo   db-list                 从数据库查询书库
echo   db-set ^<id^> [provider]  直接修改数据库（需要重启）
echo   help                    显示此帮助信息
echo.
echo 示例:
echo   REM 1. 检查环境变量
echo   %0 env
echo.
echo   REM 2. 测试 OpenList 连接
echo   %0 test /115/audiobook3
echo.
echo   REM 3. 列出所有书库
echo   %0 list
echo.
echo   REM 4. 设置书库为 OpenList 存储
echo   %0 set abc-123-def-456
echo.
echo   REM 5. 查看日志
echo   %0 logs
echo.
echo   REM 6. 直接修改数据库（快速方法）
echo   %0 db-set abc-123-def-456 openlist
echo   docker restart %CONTAINER_NAME%
echo.
echo 注意:
echo   - 确保容器名称正确（当前: %CONTAINER_NAME%）
echo   - 使用 db-set 命令后需要重启容器
echo   - 修改前建议备份数据库
echo.
goto :end

:end
endlocal
