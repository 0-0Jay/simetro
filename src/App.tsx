import { useState } from 'react'
import { Header } from './components/Header'
import { TabBar, type TabId } from './components/TabBar'
import { HomeTab } from './tabs/HomeTab'
import { MissionTab } from './tabs/MissionTab'
import { SettingsTab } from './tabs/SettingsTab'
import { useGameClockTicker } from './hooks/useGameClockTicker'
import { useOfflineClockPersistence } from './hooks/useOfflineClockPersistence'

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  useGameClockTicker()
  useOfflineClockPersistence()

  return (
    <>
      <Header />
      <main className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'mission' && <MissionTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
      <TabBar active={activeTab} onChange={setActiveTab} />
    </>
  )
}

export default App
