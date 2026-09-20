export interface ChatUser {
  id: number;
  name: string;
  avatar: string | null;
}

export type MessageType = 'text' | 'time' | 'image' | 'voice' | 'redpacket' | 'transfer';

export interface ChatMessage {
  id: number;
  type: MessageType;
  senderId: number;
  content: string;
  params: {
    duration?: number;
    transcript?: string;
    amount?: string;
    remark?: string;
  };
}

export interface PhoneSettings {
  platform: 'ios' | 'android';
  time: string;
  signal: number;
  secondarySignal: number;
  simMode: 'single' | 'dual';
  wifiEnabled: boolean;
  battery: number;
  contactName: string;
  unreadCount: number;
  selfBubbleColor: string;
  otherBubbleColor: string;
  backgroundColor: string;
  backgroundImage: string | null;
  /** 聊天里图片消息最长边的上限，单位是内部坐标系 px（见 lib/image-size.ts）。 */
  imageMax: number;
  /** 聊天内容字号的百分比尺度，100 = 原样。整套排版度量都跟着走（见 lib/font-size.ts）。 */
  fontScale: number;
}
