import { toCanvas } from 'html-to-image';
import {
    defaultScreenSize,
    designHeightFor,
    longshotOutputSize,
    phoneFrameWidth,
    screenOutputSize,
    type ScreenSize,
} from '@/lib/phone-size';

/** 超过这个高度浏览器就画不出来（截出来会是空白），长截图必须挡在这里。 */
const maxCanvasHeight = 16000;

// Shared by the existing single-chat editor and batch exports.
export async function captureChatPhone(phone: HTMLDivElement, longshot = false, screen: ScreenSize = defaultScreenSize): Promise<HTMLCanvasElement | null> {
    const content = phone.closest('.wc-phone-content') as HTMLElement | null;
    const wrap = phone.closest('.wc-phone-wrap') as HTMLElement | null;
    const scaleWrap = phone.closest('.wc-phone-scale-wrap') as HTMLElement | null;
    if (!content || !wrap) return null;

    // 内部坐标系宽度恒为 1125，高度按屏幕比例换算；导出像素 = 坐标系尺寸 × 采样倍率。
    const designWidth = phoneFrameWidth;
    const designHeight = designHeightFor(screen);

    // 保存原始样式
    const saved = {
      ct: content.style.transform, co: content.style.transformOrigin,
      ww: wrap.style.width, wh: wrap.style.height, wo: wrap.style.overflow,
      wr: wrap.style.borderRadius, ws: wrap.style.boxShadow,
      sp: scaleWrap?.style.position ?? '', st: scaleWrap?.style.top ?? '',
      sl: scaleWrap?.style.left ?? '', sw: scaleWrap?.style.width ?? '',
      sh: scaleWrap?.style.height ?? '',
      vh: phone.style.getPropertyValue('--wc-phone-design-height'),
    };

    // 记录当前聊天区滚动位置
    const chatBody = phone.querySelector('.wc-chat-body') as HTMLElement | null;
    const chatContent = phone.querySelector('.wc-chat-content') as HTMLElement | null;
    const scrollTop = chatBody?.scrollTop ?? 0;
    const savedContentMargin = chatContent?.style.marginTop ?? '';

    // 移除缩放，展开至原始尺寸
    content.style.transform = 'none';
    phone.style.setProperty('--wc-phone-design-height', `${designHeight}px`);
    wrap.style.width = `${designWidth}px`;
    wrap.style.height = `${designHeight}px`;
    wrap.style.overflow = 'hidden';
    wrap.style.borderRadius = '0';
    wrap.style.boxShadow = 'none';
    if (scaleWrap) {
      scaleWrap.style.position = 'fixed';
      scaleWrap.style.top = '0';
      scaleWrap.style.left = '-9999px';
      scaleWrap.style.width = `${designWidth}px`;
      scaleWrap.style.height = `${designHeight}px`;
    }

    // 普通截图：用 margin-top 偏移模拟当前滚动位置（html-to-image 克隆会丢失 scrollTop）
    if (!longshot && chatContent && scrollTop > 0) {
      chatContent.style.marginTop = `-${scrollTop}px`;
    }

    // 长截图：释放 chat body 滚动
    let longOrig: Record<string, string> | null = null;
    if (longshot) {
      const bottom = phone.querySelector('.wc-bottom') as HTMLElement;
      if (chatBody && bottom) {
        longOrig = {
          ph: phone.style.height, po: phone.style.overflow,
          bp: chatBody.style.position, bt: chatBody.style.top, bb: chatBody.style.bottom,
          bo: chatBody.style.overflowY, bh: chatBody.style.height, bm: chatBody.style.minHeight,
          dp: bottom.style.position, db: bottom.style.bottom,
        };
        phone.style.height = 'auto'; phone.style.overflow = 'visible';
        wrap.style.height = 'auto';
        chatBody.style.position = 'relative'; chatBody.style.top = 'auto';
        chatBody.style.bottom = 'auto'; chatBody.style.overflowY = 'visible';
        chatBody.style.height = 'auto';
        bottom.style.position = 'relative'; bottom.style.bottom = 'auto';
        // A long export expands beyond one phone screen; it must never shrink
        // a short conversation into a squat thumbnail with oversized chrome.
        const top = phone.querySelector('.wc-phone-top') as HTMLElement | null;
        chatBody.style.minHeight = `${Math.max(0, designHeight - (top?.offsetHeight ?? 0) - bottom.offsetHeight)}px`;
      }
    }

    // 等待浏览器重新布局
    await new Promise(r => setTimeout(r, 50));
    const totalH = longshot ? phone.scrollHeight : designHeight;
    // 普通截图的导出尺寸直接取屏幕尺寸（坐标系高度是取整过的，乘回去可能差 1 像素）。
    const output = longshot ? longshotOutputSize(screen, totalH) : screenOutputSize(screen);

    let canvas: HTMLCanvasElement | null = null;
    try {
      if (output.height > maxCanvasHeight) throw new Error('对话过长，请拆分为多组后导出（单图最高 16000 像素）。');
      canvas = await toCanvas(phone, {
        width: designWidth,
        height: totalH,
        // 放大到目标像素画布，栅格化密度跟着提高；屏幕比 1125 窄时保持 1125 再缩回去。
        canvasWidth: output.width,
        canvasHeight: output.height,
        pixelRatio: 1,
        backgroundColor: '#ededed',
      });
    } finally {
      // 还原所有样式
      content.style.transform = saved.ct; content.style.transformOrigin = saved.co;
      wrap.style.width = saved.ww; wrap.style.height = saved.wh;
      wrap.style.overflow = saved.wo; wrap.style.borderRadius = saved.wr;
      wrap.style.boxShadow = saved.ws;
      if (saved.vh) phone.style.setProperty('--wc-phone-design-height', saved.vh);
      else phone.style.removeProperty('--wc-phone-design-height');
      if (scaleWrap) {
        scaleWrap.style.position = saved.sp; scaleWrap.style.top = saved.st;
        scaleWrap.style.left = saved.sl; scaleWrap.style.width = saved.sw;
        scaleWrap.style.height = saved.sh;
      }
      // 还原滚动偏移
      if (chatContent) chatContent.style.marginTop = savedContentMargin;
      // 还原聊天区滚动位置
      if (chatBody && scrollTop > 0) {
        requestAnimationFrame(() => { chatBody.scrollTop = scrollTop; });
      }
      if (longshot && longOrig) {
        const chatBody = phone.querySelector('.wc-chat-body') as HTMLElement;
        const bottom = phone.querySelector('.wc-bottom') as HTMLElement;
        if (chatBody && bottom) {
          phone.style.height = longOrig.ph; phone.style.overflow = longOrig.po;
          chatBody.style.position = longOrig.bp; chatBody.style.top = longOrig.bt;
          chatBody.style.bottom = longOrig.bb; chatBody.style.overflowY = longOrig.bo;
          chatBody.style.height = longOrig.bh; chatBody.style.minHeight = longOrig.bm;
          bottom.style.position = longOrig.dp; bottom.style.bottom = longOrig.db;
        }
      }
    }
    return canvas;
}
