import { Platform } from '../models/TranscriptionResource';

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
    // 支持格式：
    // - https://www.youtube.com/watch?v=VIDEO_ID
    // - https://youtu.be/VIDEO_ID
    // - https://www.youtube.com/watch?v=VIDEO_ID&t=123s
    // - https://www.youtube.com/embed/VIDEO_ID (已经是嵌入格式)
    let videoId: string | null = null;
    let timeParam = '';
    
    // 如果已经是嵌入格式，提取 videoId
    const embedMatch = url.match(/youtube\.com\/embed\/([^/?&]+)/);
    if (embedMatch && embedMatch[1]) {
      videoId = embedMatch[1];
      // 从现有 URL 中提取时间参数
      const existingTimeMatch = url.match(/[?&]start=(\d+)/);
      if (existingTimeMatch) {
        timeParam = `?start=${existingTimeMatch[1]}`;
      }
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
      // 构建查询参数
      const params = new URLSearchParams();
      
      // 优先使用传入的 startTime，否则从 URL 中提取
      if (startTime !== undefined) {
        params.set('start', Math.floor(startTime).toString());
      } else if (timeParam) {
        // 从现有 timeParam 中提取 start 值
        const existingStartMatch = timeParam.match(/[?&]start=(\d+)/);
        if (existingStartMatch) {
          params.set('start', existingStartMatch[1]);
        }
      } else {
        // 从原始 URL 中提取时间参数
        const timeMatch = url.match(/[?&]t=(\d+)s?/);
        if (timeMatch) {
          params.set('start', timeMatch[1]);
        }
      }
      
      // 如果设置了自动播放，添加 autoplay 参数
      if (autoplay) {
        params.set('autoplay', '1');
      }
      
      // 如果设置了静音，添加 mute 参数
      // 注意：大多数浏览器要求静音才能自动播放，所以如果 autoplay=true，建议同时设置 mute=true
      if (mute) {
        params.set('mute', '1');
      }
      
      const queryString = params.toString();
      return `https://www.youtube.com/embed/${videoId}${queryString ? '?' + queryString : ''}`;
    }
  } else if (platform === Platform.BILIBILI) {
    // Bilibili URL 转换
    // 支持格式：
    // - https://www.bilibili.com/video/BVxxxxx
    // - https://www.bilibili.com/video/avxxxxx
    // - https://www.bilibili.com/video/BVxxxxx?p=2 (分P视频)
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


