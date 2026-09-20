import type { PhoneSettings } from '@/types'
import { defaultImageMax } from '@/lib/image-size'
import { WechatPhoneHeader, type WechatHeaderAction } from '@/components/WechatPhoneHeader'

interface WechatPhoneChromeProps {
  title?: string
  children: React.ReactNode
  className?: string
  watermark?: boolean
  rightAction?: WechatHeaderAction
}

// 这里只用到状态栏那几个字段，其余（含图片大小）一律取默认值。
const compactHeaderSettings: PhoneSettings = { platform: 'ios', time: '12:02', signal: 4, secondarySignal: 4, simMode: 'single', wifiEnabled: true, battery: 87, contactName: '', unreadCount: 0, selfBubbleColor: '#95ec69', otherBubbleColor: '#ffffff', backgroundColor: '#ededed', backgroundImage: null, imageMax: defaultImageMax }

export function WechatPhoneChrome({ title = '', children, className = '', watermark = true, rightAction = 'dots' }: WechatPhoneChromeProps) {
  return (
    <div className={`wechat-phone-chrome ${className}`}>
      <div className="wechat-chrome-screen">
        <WechatPhoneHeader settings={compactHeaderSettings} title={title} variant="compact" rightAction={rightAction} />
        <div className="wechat-chrome-content">{children}</div>
        {watermark && <div className="wechat-chrome-watermark">模拟界面 · 非真实微信内容</div>}
        <div className="wechat-chrome-home-indicator" />
      </div>
    </div>
  )
}
