
import React, { useState, useCallback } from 'react';
import VoiceAgent from './components/VoiceAgent';

const App: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-white/10 flex justify-between items-center backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-xl font-bold">RK</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-tight leading-none">Rich Klein</h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold">Crisis Management</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm">
          <a 
            href="https://www.linkedin.com/in/richkleincrisis/details/recommendations/?detailScreenTabIndex=0" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 transition-colors font-medium flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            Client Testimonials
          </a>
          <div className="text-slate-400 font-medium">
            Global Strategic PR & Media Relations
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-12 flex flex-col items-center justify-center max-w-4xl">
        {!isStarted ? (
          <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-block px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-4">
              Available 24/7 Worldwide
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight">
              Protect your reputation <br />
              <span className="text-blue-500">when it matters most.</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              Experience immediate strategic guidance. Our AI voice agent is trained on Rich Klein's decades of expertise to help you navigate high-stakes crises in real-time.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setIsStarted(true)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-blue-600/30 flex items-center justify-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                Start Consultation
              </button>
              
              <a
                href="https://www.linkedin.com/in/richkleincrisis/details/recommendations/?detailScreenTabIndex=0"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-10 py-4 rounded-full text-lg font-semibold transition-all border border-amber-500/30 flex items-center justify-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                View Recommendations
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
              {[
                { title: 'Global Support', desc: 'U.S. and Italy based insights' },
                { title: 'Instant Strategy', desc: 'Immediate crisis response steps' },
                { title: 'Proven Results', desc: '30+ years of agency experience' },
              ].map((feature, i) => (
                <div key={i} className="bg-white/5 p-6 rounded-2xl border border-white/10 text-left">
                  <h3 className="font-semibold text-blue-400 mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-400">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full h-full animate-in zoom-in-95 duration-500">
             <VoiceAgent onExit={() => setIsStarted(false)} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-slate-500 text-xs border-t border-white/10">
        © {new Date().getFullYear()} Rich Klein Crisis Management. Professional PR Consultation.
      </footer>
    </div>
  );
};

export default App;
