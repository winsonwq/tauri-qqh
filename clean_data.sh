#!/bin/bash

# 清理 qqh-tauri 应用数据存储的脚本
# 使用方法: ./clean_data.sh [选项]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 应用标识符
APP_IDENTIFIER="com.aqiu.qqh-tauri"
APP_NAME="Echo"

# 检测操作系统并设置应用数据目录
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    APP_DATA_DIR="$HOME/Library/Application Support/$APP_IDENTIFIER"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    APP_DATA_DIR="$HOME/.config/$APP_IDENTIFIER"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash/Cygwin)
    APP_DATA_DIR="$APPDATA/$APP_IDENTIFIER"
else
    echo -e "${RED}不支持的操作系统: $OSTYPE${NC}"
    exit 1
fi

# 显示帮助信息
show_help() {
    echo -e "${BLUE}清理 $APP_NAME 应用数据存储${NC}"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -a, --all              清理所有数据（数据库、转写结果、音频、字幕、模型、配置）"
    echo "  -d, --database          清理数据库文件"
    echo "  -t, --transcription    清理转写结果文件"
    echo "  -e, --extracted-audio  清理提取的音频文件"
    echo "  -s, --subtitles        清理字幕文件"
    echo "  -m, --models           清理 Whisper 模型文件"
    echo "  -c, --config           清理 MCP 配置文件"
    echo "  -l, --list             列出所有数据文件（不删除）"
    echo "  -h, --help             显示此帮助信息"
    echo ""
    echo "应用数据目录: $APP_DATA_DIR"
    echo ""
    echo "示例:"
    echo "  $0 --all                # 清理所有数据"
    echo "  $0 --database           # 只清理数据库"
    echo "  $0 --list               # 列出所有数据文件"
}

# 检查目录是否存在
check_dir() {
    if [ ! -d "$APP_DATA_DIR" ]; then
        echo -e "${YELLOW}应用数据目录不存在: $APP_DATA_DIR${NC}"
        return 1
    fi
    return 0
}

# 列出所有数据文件
list_files() {
    echo -e "${BLUE}应用数据目录: $APP_DATA_DIR${NC}"
    echo ""
    
    if ! check_dir; then
        echo -e "${YELLOW}没有找到任何数据文件${NC}"
        return
    fi
    
    echo -e "${GREEN}数据库文件:${NC}"
    if [ -f "$APP_DATA_DIR/transcription.db" ]; then
        ls -lh "$APP_DATA_DIR/transcription.db" 2>/dev/null || echo "  不存在"
    else
        echo "  不存在"
    fi
    
    echo ""
    echo -e "${GREEN}转写结果目录:${NC}"
    if [ -d "$APP_DATA_DIR/transcription_results" ]; then
        du -sh "$APP_DATA_DIR/transcription_results" 2>/dev/null || echo "  空目录"
        find "$APP_DATA_DIR/transcription_results" -type f | wc -l | xargs echo "  文件数量:"
    else
        echo "  不存在"
    fi
    
    echo ""
    echo -e "${GREEN}提取的音频目录:${NC}"
    if [ -d "$APP_DATA_DIR/extracted_audio" ]; then
        du -sh "$APP_DATA_DIR/extracted_audio" 2>/dev/null || echo "  空目录"
        find "$APP_DATA_DIR/extracted_audio" -type f | wc -l | xargs echo "  文件数量:"
    else
        echo "  不存在"
    fi
    
    echo ""
    echo -e "${GREEN}字幕文件目录:${NC}"
    if [ -d "$APP_DATA_DIR/subtitles" ]; then
        du -sh "$APP_DATA_DIR/subtitles" 2>/dev/null || echo "  空目录"
        find "$APP_DATA_DIR/subtitles" -type f | wc -l | xargs echo "  文件数量:"
    else
        echo "  不存在"
    fi
    
    echo ""
    echo -e "${GREEN}Whisper 模型目录:${NC}"
    if [ -d "$APP_DATA_DIR/whisper_models" ]; then
        du -sh "$APP_DATA_DIR/whisper_models" 2>/dev/null || echo "  空目录"
        find "$APP_DATA_DIR/whisper_models" -type f | wc -l | xargs echo "  文件数量:"
    else
        echo "  不存在"
    fi
    
    echo ""
    echo -e "${GREEN}MCP 配置文件:${NC}"
    if [ -f "$APP_DATA_DIR/mcp_configs.json" ]; then
        ls -lh "$APP_DATA_DIR/mcp_configs.json" 2>/dev/null || echo "  不存在"
    else
        echo "  不存在"
    fi
    
    echo ""
    echo -e "${BLUE}总大小:${NC}"
    if [ -d "$APP_DATA_DIR" ]; then
        du -sh "$APP_DATA_DIR" 2>/dev/null
    fi
}

# 确认删除
confirm_delete() {
    local item_name="$1"
    echo -e "${YELLOW}警告: 即将删除 $item_name${NC}"
    read -p "确认删除? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${YELLOW}已取消${NC}"
        return 1
    fi
    return 0
}

# 清理数据库
clean_database() {
    if [ -f "$APP_DATA_DIR/transcription.db" ]; then
        if confirm_delete "数据库文件"; then
            rm -f "$APP_DATA_DIR/transcription.db"
            echo -e "${GREEN}✓ 数据库文件已删除${NC}"
        fi
    else
        echo -e "${YELLOW}数据库文件不存在${NC}"
    fi
}

# 清理转写结果
clean_transcription() {
    if [ -d "$APP_DATA_DIR/transcription_results" ]; then
        if confirm_delete "转写结果目录"; then
            rm -rf "$APP_DATA_DIR/transcription_results"
            echo -e "${GREEN}✓ 转写结果目录已删除${NC}"
        fi
    else
        echo -e "${YELLOW}转写结果目录不存在${NC}"
    fi
}

# 清理提取的音频
clean_extracted_audio() {
    if [ -d "$APP_DATA_DIR/extracted_audio" ]; then
        if confirm_delete "提取的音频目录"; then
            rm -rf "$APP_DATA_DIR/extracted_audio"
            echo -e "${GREEN}✓ 提取的音频目录已删除${NC}"
        fi
    else
        echo -e "${YELLOW}提取的音频目录不存在${NC}"
    fi
}

# 清理字幕文件
clean_subtitles() {
    if [ -d "$APP_DATA_DIR/subtitles" ]; then
        if confirm_delete "字幕文件目录"; then
            rm -rf "$APP_DATA_DIR/subtitles"
            echo -e "${GREEN}✓ 字幕文件目录已删除${NC}"
        fi
    else
        echo -e "${YELLOW}字幕文件目录不存在${NC}"
    fi
}

# 清理模型文件
clean_models() {
    if [ -d "$APP_DATA_DIR/whisper_models" ]; then
        if confirm_delete "Whisper 模型目录（可能很大）"; then
            rm -rf "$APP_DATA_DIR/whisper_models"
            echo -e "${GREEN}✓ Whisper 模型目录已删除${NC}"
        fi
    else
        echo -e "${YELLOW}Whisper 模型目录不存在${NC}"
    fi
}

# 清理配置文件
clean_config() {
    if [ -f "$APP_DATA_DIR/mcp_configs.json" ]; then
        if confirm_delete "MCP 配置文件"; then
            rm -f "$APP_DATA_DIR/mcp_configs.json"
            echo -e "${GREEN}✓ MCP 配置文件已删除${NC}"
        fi
    else
        echo -e "${YELLOW}MCP 配置文件不存在${NC}"
    fi
}

# 清理所有数据
clean_all() {
    echo -e "${RED}警告: 即将删除所有应用数据！${NC}"
    echo -e "${YELLOW}这将包括:${NC}"
    echo "  - 数据库文件（所有资源和任务记录）"
    echo "  - 转写结果文件"
    echo "  - 提取的音频文件"
    echo "  - 字幕文件"
    echo "  - Whisper 模型文件（如果存在）"
    echo "  - MCP 配置文件"
    echo ""
    read -p "确认删除所有数据? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${YELLOW}已取消${NC}"
        return
    fi
    
    check_dir || return
    
    clean_database
    clean_transcription
    clean_extracted_audio
    clean_subtitles
    clean_models
    clean_config
    
    echo ""
    echo -e "${GREEN}✓ 所有数据已清理完成${NC}"
}

# 主函数
main() {
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--all)
                clean_all
                shift
                ;;
            -d|--database)
                check_dir && clean_database
                shift
                ;;
            -t|--transcription)
                check_dir && clean_transcription
                shift
                ;;
            -e|--extracted-audio)
                check_dir && clean_extracted_audio
                shift
                ;;
            -s|--subtitles)
                check_dir && clean_subtitles
                shift
                ;;
            -m|--models)
                check_dir && clean_models
                shift
                ;;
            -c|--config)
                check_dir && clean_config
                shift
                ;;
            -l|--list)
                list_files
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}未知选项: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done
}

# 运行主函数
main "$@"


