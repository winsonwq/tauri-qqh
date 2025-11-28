import "./App.css";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import ToastContainer from "./components/Toast/ToastContainer";

function App() {
  return (
    <ToastProvider>
      <div className="h-full w-full">
        <Layout />
        <ToastContainer />
      </div>
    </ToastProvider>
  );
}

export default App;
