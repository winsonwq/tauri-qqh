import { Platform } from '../models/TranscriptionResource';

/**
 * YouTube 播放器页面 URL
 * 用于作为中间层来避免 YouTube embed 限制
 * 
 * 注意：CSP 配置已设置为允许所有 HTTPS 连接（使用 https: 通配符）
 * 因此任何 HTTPS 的 CDN 地址都可以正常访问，无需额外配置
 */
export const YOUTUBE_PLAYER_URL = 'https://assets.metaplus.zone/uPic/player.html';

/**
 * 检测URL平台类型
 * @param url URL字符串
 * @returns 平台类型，如果不是URL则返回null
 */
export function detectUrlPlatform(url: string): Platform | null {
  const urlLower = url.toLowerCase();
  
  // YouTube 检测
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return Platform.YOUTUBE;
  }
  
  // Bilibili 检测
  if (urlLower.includes('bilibili.com') || urlLower.includes('b23.tv')) {
    return Platform.BILIBILI;
  }
  
  // 如果看起来是URL但不是已知平台，返回 Other
  if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
    return Platform.OTHER;
  }
  
  return null;
}

/**
 * 检测是否为URL
 * @param path 路径字符串
 * @returns 是否为URL
 */
export function isUrl(path: string): boolean {
  const pathLower = path.toLowerCase();
  return pathLower.startsWith('http://') || pathLower.startsWith('https://');
}

/**
 * 验证URL格式
 * @param url URL字符串
 * @returns 是否为有效的URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 从URL提取视频标题（用于默认资源名称）
 * @param url URL字符串
 * @returns 建议的资源名称
 */
export function extractResourceNameFromUrl(url: string): string {
  const platform = detectUrlPlatform(url);
  
  if (platform === Platform.YOUTUBE) {
    // 尝试从YouTube URL提取视频ID
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (match && match[1]) {
      return `YouTube视频-${match[1].substring(0, 11)}`;
    }
  } else if (platform === Platform.BILIBILI) {
    // 尝试从Bilibili URL提取视频ID
    const match = url.match(/bilibili\.com\/video\/([^/?]+)/);
    if (match && match[1]) {
      return `Bilibili视频-${match[1]}`;
    }
  }
  
  // 默认名称
  return `外部视频-${new Date().toLocaleString()}`;
}

/**
 * 将视频 URL 转换为嵌入 URL
 * @param url 原始视频 URL
 * @param startTime 起始播放时间（秒），可选
 * @param autoplay 是否自动播放，默认 false
 * @param mute 是否静音，默认 false。注意：大多数浏览器要求静音才能自动播放
 * @returns 嵌入 URL，如果无法转换则返回 null
 */
export function convertToEmbedUrl(url: string, startTime?: number, autoplay: boolean = false, mute: boolean = false): string | null {
  const platform = detectUrlPlatform(url);
  
  if (platform === Platform.YOUTUBE) {
    // YouTube URL 转换
    // 使用 CDN 上的 player.html 作为中间层来避免 YouTube embed 限制
    let videoId: string | null = null;
    
    // 如果已经是嵌入格式，提取 videoId
    const embedMatch = url.match(/youtube\.com\/embed\/([^/?&]+)/);
    if (embedMatch && embedMatch[1]) {
      videoId = embedMatch[1];
    }
    
    // 匹配 youtube.com/watch?v=VIDEO_ID
    if (!videoId) {
      const watchMatch = url.match(/(?:youtube\.com\/watch\?v=)([^&\s]+)/);
      if (watchMatch && watchMatch[1]) {
        videoId = watchMatch[1];
      }
    }
    
    // 匹配 youtu.be/VIDEO_ID
    if (!videoId) {
      const shortMatch = url.match(/(?:youtu\.be\/)([^?\s]+)/);
      if (shortMatch && shortMatch[1]) {
        videoId = shortMatch[1];
      }
    }
    
    if (videoId) {
      // 构建查询参数，传递给 CDN 上的 player.html
      const params = new URLSearchParams();
      
      // 视频 ID 参数（必需）
      params.set('v', videoId);
      
      // 优先使用传入的 startTime，否则从 URL 中提取
      if (startTime !== undefined) {
        params.set('start', Math.floor(startTime).toString());
      } else {
        // 从原始 URL 中提取时间参数
        // 支持 start= 和 t= 两种格式
        const startMatch = url.match(/[?&]start=(\d+)/);
        const timeMatch = url.match(/[?&]t=(\d+)s?/);
        if (startMatch) {
          params.set('start', startMatch[1]);
        } else if (timeMatch) {
          params.set('start', timeMatch[1]);
        }
      }
      
      // 如果设置了自动播放，添加 autoplay 参数
      if (autoplay) {
        params.set('autoplay', '1');
      } else {
        // player.html 默认 autoplay 为 true，如果需要关闭，需要显式设置
        params.set('autoplay', '0');
      }
      
      // 处理静音参数
      // 注意：大多数浏览器要求静音才能自动播放，所以如果 autoplay=true，建议同时设置 mute=true
      // 但是当 mute=false 时，需要显式传递 mute=0，否则 player.html 在 autoplay=true 时会默认静音
      if (mute) {
        params.set('mute', '1');
      } else {
        // 当 mute=false 时，显式设置 mute=0，确保不会默认静音
        params.set('mute', '0');
      }
      
      const queryString = params.toString();
      // 使用 CDN 上的 player.html 作为中间层
      return `${YOUTUBE_PLAYER_URL}?${queryString}`;
    }
  } else if (platform === Platform.BILIBILI) {
    // Bilibili URL 转换
    let bvid: string | null = null;
    let aid: string | null = null;
    let pageParam = '&page=1';
    let timeParam = '';
    
    // 从现有嵌入 URL 中提取参数
    const existingEmbedMatch = url.match(/player\.bilibili\.com\/player\.html\?([^"]+)/);
    if (existingEmbedMatch) {
      const params = new URLSearchParams(existingEmbedMatch[1]);
      bvid = params.get('bvid');
      aid = params.get('aid');
      const page = params.get('page');
      if (page) {
        pageParam = `&page=${page}`;
      }
      const t = params.get('t');
      if (t) {
        timeParam = `&t=${t}`;
      }
    }
    
    // 匹配 BV 号
    if (!bvid && !aid) {
      const bvMatch = url.match(/bilibili\.com\/video\/(BV[^/?]+)/);
      if (bvMatch && bvMatch[1]) {
        bvid = bvMatch[1];
      }
    }
    
    // 匹配 av 号
    if (!bvid && !aid) {
      const avMatch = url.match(/bilibili\.com\/video\/(av\d+)/);
      if (avMatch && avMatch[1]) {
        aid = avMatch[1].replace('av', '');
      }
    }
    
    // 提取分P参数（如果有）
    if (!pageParam || pageParam === '&page=1') {
      const pageMatch = url.match(/[?&]p=(\d+)/);
      if (pageMatch) {
        pageParam = `&page=${pageMatch[1]}`;
      }
    }
    
    // 处理时间参数
    if (startTime !== undefined) {
      timeParam = `&t=${Math.floor(startTime)}`;
    } else if (!timeParam) {
      // 从原始 URL 中提取时间参数（Bilibili 可能使用 t= 参数）
      const timeMatch = url.match(/[?&]t=(\d+)/);
      if (timeMatch) {
        timeParam = `&t=${timeMatch[1]}`;
      }
    }
    
    if (bvid) {
      return `https://player.bilibili.com/player.html?bvid=${bvid}${pageParam}${timeParam}`;
    } else if (aid) {
      return `https://player.bilibili.com/player.html?aid=${aid}${pageParam}${timeParam}`;
    }
  }
  
  // 如果无法转换，返回 null
  return null;
}

/**
 * 从 YouTube URL 提取视频 ID
 * @param url YouTube URL
 * @returns 视频 ID，如果无法提取则返回 null
 */
export function extractYouTubeVideoId(url: string): string | null {
  // 匹配 youtube.com/watch?v=VIDEO_ID
  let match = url.match(/(?:youtube\.com\/watch\?v=)([^&\s]+)/);
  if (match && match[1]) {
    return match[1];
  }
  
  // 匹配 youtu.be/VIDEO_ID
  match = url.match(/(?:youtu\.be\/)([^?\s]+)/);
  if (match && match[1]) {
    return match[1];
  }
  
  // 匹配嵌入格式
  match = url.match(/youtube\.com\/embed\/([^/?&]+)/);
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

/**
 * 获取 YouTube 视频封面 URL
 * @param url YouTube URL 或视频 ID
 * @param quality 缩略图质量，默认为 'hqdefault'
 * @returns 封面 URL，如果无法提取视频 ID 则返回 null
 */
export function getYouTubeThumbnailUrl(
  url: string, 
  quality: 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault' = 'hqdefault'
): string | null {
  // 如果已经是视频 ID（11 个字符），直接使用
  let videoId: string | null = null;
  if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
    videoId = url;
  } else {
    videoId = extractYouTubeVideoId(url);
  }
  
  if (videoId) {
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
  }
  
  return null;
}


