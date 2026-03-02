import { ElectronAPI } from '../common/types'

declare global {
    interface Window {
        electron: ElectronAPI
    }
}

export { }
