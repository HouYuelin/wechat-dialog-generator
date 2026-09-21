import { useSyncExternalStore } from 'react'
import { History, X } from 'lucide-react'
import { nameHistoryKey } from '@/lib/name-history'
import { forgetNameHistory, getNameHistory, subscribeNameHistory } from '@/lib/name-history-store'
import './NameSuggest.css'

interface NameSuggestProps {
  /** 点中一个名字。调用方决定是回填输入框，还是直接追加进列表。 */
  onPick: (name: string) => void
  /** 已经用上的名字（归一化后比较），不再出现在候选里。 */
  exclude?: readonly string[]
  /** 最多显示几个，默认 8 个。 */
  limit?: number
  /** 显示「从历史里删掉」的按钮，默认显示。 */
  removable?: boolean
  /** 这一行的说明文字，默认「最近用过」。 */
  label?: string
}

/**
 * 「最近用过的昵称」筹码行：点一下直接填进输入框，不用重打；右边的 × 把这个名字从历史里删掉。
 *
 * 历史为空时整块不渲染（返回 null），所以调用方不需要额外判断有没有数据，也不占位。
 * 数据取自共享的昵称历史快照，任何一处记了新名字，这里会立刻多出一个筹码。
 */
export function NameSuggest({ onPick, exclude = [], limit = 8, removable = true, label = '最近用过' }: NameSuggestProps) {
  const history = useSyncExternalStore(subscribeNameHistory, getNameHistory, getNameHistory)
  const taken = new Set(exclude.map(nameHistoryKey))
  const list = history.filter(entry => !taken.has(nameHistoryKey(entry.name))).slice(0, limit)
  if (!list.length) return null

  return (
    <div className="name-suggest">
      <span className="name-suggest-label"><History size={12} /> {label}</span>
      {list.map(entry => (
        <span className="name-suggest-chip" key={nameHistoryKey(entry.name)}>
          <button type="button" className="name-suggest-pick" title={`填入「${entry.name}」`} onClick={() => onPick(entry.name)}>
            {entry.name}
          </button>
          {removable && (
            <button
              type="button"
              className="name-suggest-forget"
              title="从最近用过里删掉"
              aria-label={`从「${label}」里删除 ${entry.name}`}
              onClick={() => forgetNameHistory(entry.name)}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
