import GameCanvas from './game/GameCanvas'
import Hud from './hud/Hud'
import './App.css'

function App() {
  return (
    <div className="app">
      <GameCanvas />
      <Hud />
    </div>
  )
}

export default App
