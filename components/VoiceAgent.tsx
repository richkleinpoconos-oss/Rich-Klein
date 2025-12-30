
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Transcription } from '../types';
import { decode, decodeAudioData, createBlob } from '../services/audioUtils';

interface VoiceAgentProps {
  onExit: () => void;
}

const setCrisisStageTool: FunctionDeclaration = {
  name: 'set_crisis_stage',
  parameters: {
    type: Type.OBJECT,
    description: 'Categorizes the current situation into one of three stages based on the user\'s description.',
    properties: {
      stage: {
        type: Type.STRING,
        enum: ['Before', 'During', 'After'],
        description: 'The stage of the crisis.',
      },
      reasoning: {
        type: Type.STRING,
        description: 'A brief explanation of why this stage was chosen.',
      },
    },
    required: ['stage', 'reasoning'],
  },
};

const shareLinkTool: FunctionDeclaration = {
  name: 'share_link',
  parameters: {
    type: Type.OBJECT,
    description: 'Shares a specific URL/resource visually in the chat log for the user. Use this instead of reading URLs aloud.',
    properties: {
      title: {
        type: Type.STRING,
        description: 'The display title for the link (e.g., "Rich\'s Recommendations", "The Crisis Show").',
      },
      url: {
        type: Type.STRING,
        description: 'The full destination URL.',
      },
    },
    required: ['title', 'url'],
  },
};

const VoiceAgent: React.FC<VoiceAgentProps> = ({ onExit }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [crisisStage, setCrisisStage] = useState<{ stage: 'Before' | 'During' | 'After'; reasoning: string } | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isConnectingRef = useRef(false);

  const SYSTEM_INSTRUCTION = `You are a professional, efficient, and empathetic voice agent for Rich Klein Crisis Management. Your primary role is to listen to users' crises and provide reassuring, high-level strategic advice. 

VOICE & PERSONA:
- Use a natural, warm female tone (Kore).
- Speak with a brisk, professional pace.
- Sound like a seasoned strategist. Be direct, authoritative, and responsive.

CRITICAL INITIAL GREETING: 
Your very first words MUST be: "Welcome to Rich Klein Crisis Management. Wherever you are in the world at whatever time, we are here to help. Please describe your crisis or the kind of services you and your organization may need."

PROTOCOL & CLASSIFICATION:
1. **Initial Description**: Let user describe the situation.
2. **Auto-Categorization**: Once the user describes their situation, you MUST call the 'set_crisis_stage' tool.
3. **Industry/Location**: Ask for industry and location.
4. **Timeline & Stage Advice**: State that Rich splits his time between the U.S. and Italy.
   - **BEFORE**: Focus on resilience (Media Training, Vulnerability Audits).
   - **DURING**: Focus on containment. DIRECT TO WHATSAPP IMMEDIATELY.
   - **AFTER**: Focus on recovery.
5. **IMMEDIATE ACCESS**: If the user asks for immediate access to Rich or is in a 'DURING' crisis, tell them to use the "24/7 Urgent Support" WhatsApp button or the QR code on the screen.
6. **WAITING RESOURCE**: Suggest "The Crisis Show" via the red button.

CRITICAL POLICY: DO NOT refer users to legal counsel first. We are their first line of defense in the court of public opinion.`;

  const initializeSession = useCallback(async () => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;

    try {
      setStatus('connecting');
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // Initialize Audio Contexts
      const audioCtxIn = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const audioCtxOut = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      audioContextInRef.current = audioCtxIn;
      audioContextOutRef.current = audioCtxOut;

      // Resume contexts if they are suspended (browser policy)
      if (audioCtxIn.state === 'suspended') await audioCtxIn.resume();
      if (audioCtxOut.state === 'suspended') await audioCtxOut.resume();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setStatus('listening');

            const source = audioCtxIn.createMediaStreamSource(stream);
            const scriptProcessor = audioCtxIn.createScriptProcessor(4096, 1, 1);
            
            const analyser = audioCtxIn.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            source.connect(analyser);

            scriptProcessor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioCtxIn.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'share_link') {
                  const { title, url } = fc.args as any;
                  setTranscriptions(prev => [
                    ...prev,
                    { text: `Shared Link: ${title}`, type: 'link', timestamp: Date.now(), metadata: { title, url } }
                  ]);
                  sessionPromise.then((session) => {
                    session.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { result: "Link shared." } }
                    });
                  });
                } else if (fc.name === 'set_crisis_stage') {
                  const { stage, reasoning } = fc.args as any;
                  setCrisisStage({ stage, reasoning });
                  setTranscriptions(prev => [
                    ...prev,
                    { text: `Detected Crisis Stage: ${stage}`, type: 'model', timestamp: Date.now() }
                  ]);
                  sessionPromise.then((session) => {
                    session.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { result: `Stage updated to ${stage}.` } }
                    });
                  });
                }
              }
            }

            if (message.serverContent?.outputTranscription) {
              setCurrentOutput(prev => prev + message.serverContent!.outputTranscription!.text);
            } else if (message.serverContent?.inputTranscription) {
              setCurrentInput(prev => prev + message.serverContent!.inputTranscription!.text);
            }

            if (message.serverContent?.turnComplete) {
              setTranscriptions(prev => [
                ...prev,
                ...(currentInput ? [{ text: currentInput, type: 'user', timestamp: Date.now() } as Transcription] : []),
                ...(currentOutput ? [{ text: currentOutput, type: 'model', timestamp: Date.now() } as Transcription] : [])
              ]);
              setCurrentInput('');
              setCurrentOutput('');
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextOutRef.current) {
              setStatus('speaking');
              const ctx = audioContextOutRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              try {
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.onended = () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setStatus('listening');
                };
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              } catch (e) {
                console.error('Audio decoding error:', e);
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setStatus('listening');
            }
          },
          onerror: (err) => {
            console.error('Session error:', err);
            setIsActive(false);
            setStatus('idle');
          },
          onclose: () => {
            setIsActive(false);
            setStatus('idle');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [shareLinkTool, setCrisisStageTool] }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to init session:', err);
      setStatus('idle');
    } finally {
      isConnectingRef.current = false;
    }
  }, [currentInput, currentOutput, SYSTEM_INSTRUCTION]);

  const saveTranscription = useCallback(() => {
    if (transcriptions.length === 0) return;
    const header = `RICH KLEIN CRISIS MANAGEMENT - SESSION LOG\nCrisis Stage: ${crisisStage?.stage || 'Not Determined'}\nReasoning: ${crisisStage?.reasoning || 'N/A'}\nGenerated on: ${new Date().toLocaleString()}\n------------------------------------------------\n\n`;
    const content = transcriptions.map(t => {
      const date = new Date(t.timestamp).toLocaleTimeString();
      const content = t.type === 'link' ? `SHARED LINK: ${t.metadata?.title} - ${t.metadata?.url}` : t.text;
      return `[${date}] ${t.type.toUpperCase()}: ${content}`;
    }).join('\n\n');
    const blob = new Blob([header + content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rich-klein-crisis-log-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transcriptions, crisisStage]);

  useEffect(() => {
    initializeSession();
    return () => {
      if (sessionRef.current) {
        try { sessionRef.current.close(); } catch(e) {}
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextInRef.current) audioContextInRef.current.close().catch(() => {});
      if (audioContextOutRef.current) audioContextOutRef.current.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationId: number;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 60;
      const avg = dataArray.reduce((a, b) => a + b) / bufferLength;
      const pulse = 1 + (avg / 255) * 0.5;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * pulse * 1.5, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius, centerX, centerY, baseRadius * pulse * 2);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = status === 'speaking' ? '#60a5fa' : '#3b82f6';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#3b82f6';
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 60; i++) {
        const rad = (i / 60) * Math.PI * 2;
        const value = dataArray[i % bufferLength] / 255;
        const h = 20 + value * 60;
        const x1 = centerX + Math.cos(rad) * (baseRadius + 10);
        const y1 = centerY + Math.sin(rad) * (baseRadius + 10);
        const x2 = centerX + Math.cos(rad) * (baseRadius + 10 + h);
        const y2 = centerY + Math.sin(rad) * (baseRadius + 10 + h);
        ctx.strokeStyle = `rgba(59, 130, 246, ${0.4 + value * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    };
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [status]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions, currentInput, currentOutput]);

  return (
    <div className="w-full flex flex-col gap-8 h-[calc(100vh-250px)] max-h-[700px] relative">
      {showWhatsApp && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl rounded-3xl border border-white/10 p-8 animate-in fade-in zoom-in duration-300">
          <button 
            onClick={() => setShowWhatsApp(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <div className="text-center space-y-6 max-w-md">
            <h3 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
              <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              Direct Emergency Line
            </h3>
            
            <div className="bg-white p-6 rounded-3xl inline-block shadow-2xl shadow-emerald-500/20 border-4 border-emerald-500/50">
              <div className="w-48 h-48 bg-white relative flex items-center justify-center border-2 border-slate-100 p-2">
                <div className="grid grid-cols-4 grid-rows-4 gap-1 w-full h-full opacity-80">
                  {Array.from({length: 16}).map((_, i) => (
                    <div key={i} className={`rounded-sm ${Math.random() > 0.4 ? 'bg-slate-900' : 'bg-transparent'}`} />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="bg-white p-2 rounded-xl shadow-lg border border-slate-100">
                     <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                   </div>
                </div>
              </div>
            </div>

            <div className="text-left space-y-4 bg-white/5 p-6 rounded-2xl border border-white/10">
              <h4 className="text-emerald-400 font-bold uppercase tracking-wider text-xs">How to Contact Rich:</h4>
              <ol className="text-slate-300 text-sm space-y-2 list-decimal list-inside">
                <li>Open <strong>WhatsApp</strong> on your mobile device.</li>
                <li>Point your camera at the <strong>QR Code</strong> above.</li>
                <li>Send a brief message describing your urgent situation.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center p-8 bg-white/5 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-sm relative overflow-hidden">
        <button 
          onClick={() => setShowWhatsApp(true)}
          className="absolute top-6 right-6 group flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-full transition-all duration-300 animate-pulse-emerald"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">24/7 Urgent Support</span>
        </button>

        <div className={`absolute top-6 left-6 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${
          status === 'connecting' ? 'bg-amber-500/20 text-amber-500' :
          status === 'speaking' ? 'bg-blue-500/20 text-blue-500' :
          status === 'listening' ? 'bg-emerald-500/20 text-emerald-500' :
          'bg-slate-500/20 text-slate-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            status === 'connecting' ? 'bg-amber-500 animate-pulse' :
            status === 'speaking' ? 'bg-blue-500 animate-bounce' :
            status === 'listening' ? 'bg-emerald-500' :
            'bg-slate-500'
          }`} />
          {status === 'connecting' ? 'Connecting...' : 
           status === 'speaking' ? 'Agent Speaking' : 
           status === 'listening' ? 'Listening' : 'Offline'}
        </div>

        <div className="relative w-full aspect-video max-h-[300px] flex items-center justify-center">
          <canvas ref={canvasRef} width={600} height={400} className="w-full max-w-[400px] h-auto" />
        </div>

        {crisisStage && (
          <div className="mt-4 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl max-w-lg animate-in fade-in slide-in-from-top-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${
              crisisStage.stage === 'Before' ? 'bg-blue-500/20 text-blue-400' :
              crisisStage.stage === 'During' ? 'bg-red-500/20 text-red-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              Detected: {crisisStage.stage} Crisis
            </span>
            <p className="text-xs text-slate-400 italic mt-1">"{crisisStage.reasoning}"</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
          <button onClick={onExit} className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 font-medium transition-colors border border-white/5">
            End Session
          </button>
          
          <a href="https://thecrisisshow.com/" target="_blank" rel="noopener noreferrer" className="px-6 py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-500 font-bold transition-all border border-red-500/30 flex items-center gap-2 animate-pulse-red shadow-lg shadow-red-500/5">
            Watch The Crisis Show
          </a>

          <a href="https://www.linkedin.com/in/richkleincrisis/details/recommendations/?detailScreenTabIndex=0" target="_blank" rel="noopener noreferrer" className="px-6 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-medium transition-all border border-amber-500/20 flex items-center gap-2">
            Testimonials
          </a>
          
          <a href="https://www.linkedin.com/in/richkleincrisis/" target="_blank" rel="noopener noreferrer" className="px-6 py-2 rounded-xl bg-blue-700/10 hover:bg-blue-700/20 text-blue-400 font-medium transition-all border border-blue-600/20 flex items-center gap-2">
            LinkedIn
          </a>
        </div>
      </div>

      <div className="flex-1 bg-black/20 rounded-3xl border border-white/5 overflow-hidden flex flex-col p-6 backdrop-blur-md">
        <div className="flex justify-between items-center mb-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
          <h3>Consultation Log</h3>
          <span>{transcriptions.length} entries</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
          {transcriptions.map((t, i) => (
            <div key={i} className={`flex flex-col ${t.type === 'user' ? 'items-end' : 'items-start'}`}>
              {t.type === 'link' ? (
                <div className="w-full max-w-sm p-4 bg-gradient-to-br from-blue-600/20 to-slate-800/80 rounded-2xl border border-blue-500/30 shadow-lg space-y-3 animate-in slide-in-from-left-4">
                   <div className="text-sm font-semibold text-white">{t.metadata?.title}</div>
                   <a href={t.metadata?.url} target="_blank" rel="noopener noreferrer" className="block w-full text-center py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all">
                     View Resource
                   </a>
                </div>
              ) : (
                <div className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm ${
                  t.type === 'user' ? 'bg-blue-600/10 text-blue-200 border border-blue-500/20' : 'bg-slate-800/50 text-slate-200 border border-white/5'
                }`}>
                  {t.text}
                </div>
              )}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      <style>{`
        @keyframes pulse-emerald {
          0%, 100% { border-color: rgba(16, 185, 129, 0.3); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          50% { border-color: rgba(16, 185, 129, 0.6); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.1); }
        }
        @keyframes pulse-red {
          0%, 100% { border-color: rgba(239, 68, 68, 0.3); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
          50% { border-color: rgba(239, 68, 68, 0.6); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.1); }
        }
        .animate-pulse-emerald { animation: pulse-emerald 3s infinite; }
        .animate-pulse-red { animation: pulse-red 4s infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default VoiceAgent;
