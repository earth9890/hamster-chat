import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  MessageCircle, 
  X, 
  ChevronRight, 
  Send,
  ShieldCheck,
  Zap,
  Users,
  Check,
  AlertTriangle,
  Phone
} from 'lucide-react';
import './App.css';

interface ConnectionState {
  status: 'idle' | 'waiting' | 'connected' | 'error';
  roomId?: string;
}

const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling'],
});

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: 'idle' });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [messages, setMessages] = useState<Array<{text: string, sender: 'me' | 'partner', timestamp: Date}>>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [videoDebug, setVideoDebug] = useState({ local: '', remote: '' });
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server with id:', socket.id);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
    
    socket.on('waiting-for-partner', () => {
      console.log('Waiting for partner...');
      setConnectionState({ status: 'waiting' });
    });

    socket.on('partner-found', ({ roomId, initiator }) => {
      console.log('Partner found! Room:', roomId, 'Initiator:', initiator);
      setConnectionState({ status: 'connected', roomId });
      setTimeElapsed(0);
      if (localStream && initiator) {
        createPeerConnection(roomId, true);
      }
    });

    socket.on('offer', async ({ offer }) => {
      console.log('Received offer');
    });

    socket.on('answer', async ({ answer }) => {
      console.log('Received answer');
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(answer);
      }
    });

    socket.on('ice-candidate', ({ candidate }) => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.addIceCandidate(candidate);
      }
    });

    socket.on('partner-disconnected', () => {
      handleDisconnect();
    });

    socket.on('chat-message', ({ message, roomId }) => {
      if (roomId === connectionState.roomId) {
        setMessages(prev => [...prev, { text: message, sender: 'partner', timestamp: new Date() }]);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('waiting-for-partner');
      socket.off('partner-found');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('partner-disconnected');
      socket.off('chat-message');
    };
  }, [connectionState.roomId, localStream]);

  // Timer for connection duration
  useEffect(() => {
    if (connectionState.status === 'connected') {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTimeElapsed(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [connectionState.status]);

  // Handle incoming offers
  useEffect(() => {
    const handleOffer = async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      console.log('Processing offer for room:', connectionState.roomId);
      
      if (!peerConnectionRef.current && connectionState.roomId && localStream) {
        await createPeerConnection(connectionState.roomId, false);
      }
      
      if (peerConnectionRef.current && connectionState.roomId) {
        await peerConnectionRef.current.setRemoteDescription(offer);
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        
        socket.emit('answer', { 
          answer, 
          roomId: connectionState.roomId 
        });
      }
    };
    
    socket.off('offer');
    socket.on('offer', handleOffer);
    
    return () => {
      socket.off('offer', handleOffer);
    };
  }, [connectionState.roomId, localStream]);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      console.log('Setting local video stream', localStream);
      console.log('Video element exists:', !!localVideoRef.current);
      console.log('Video element dimensions:', localVideoRef.current.clientWidth, 'x', localVideoRef.current.clientHeight);
      
      // Check video tracks
      const videoTracks = localStream.getVideoTracks();
      console.log('Video tracks:', videoTracks);
      videoTracks.forEach((track, index) => {
        console.log(`Video track ${index}:`, {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings()
        });
      });
      
      localVideoRef.current.srcObject = localStream;
      
      // Add event listeners to debug video element
      localVideoRef.current.onloadedmetadata = () => {
        console.log('Local video metadata loaded');
        console.log('Video dimensions:', localVideoRef.current!.videoWidth, 'x', localVideoRef.current!.videoHeight);
      };
      
      localVideoRef.current.onplaying = () => {
        console.log('Local video is playing');
        setVideoDebug(prev => ({ ...prev, local: 'Playing' }));
      };
      
      localVideoRef.current.onpause = () => {
        console.log('Local video is paused');
      };
      
      localVideoRef.current.onerror = (e) => {
        console.error('Local video error:', e);
      };
      
      // Force play in case autoplay is blocked
      localVideoRef.current.play()
        .then(() => console.log('Local video play() successful'))
        .catch(e => console.log('Local video play error:', e));
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      console.log('Setting remote video stream', remoteStream);
      console.log('Remote video element exists:', !!remoteVideoRef.current);
      console.log('Remote video element dimensions:', remoteVideoRef.current.clientWidth, 'x', remoteVideoRef.current.clientHeight);
      
      // Check video tracks
      const videoTracks = remoteStream.getVideoTracks();
      console.log('Remote video tracks:', videoTracks);
      videoTracks.forEach((track, index) => {
        console.log(`Remote video track ${index}:`, {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings()
        });
      });
      
      remoteVideoRef.current.srcObject = remoteStream;
      
      // Add event listeners to debug video element
      remoteVideoRef.current.onloadedmetadata = () => {
        console.log('Remote video metadata loaded');
        console.log('Remote video dimensions:', remoteVideoRef.current!.videoWidth, 'x', remoteVideoRef.current!.videoHeight);
      };
      
      remoteVideoRef.current.onplaying = () => {
        console.log('Remote video is playing');
        setVideoDebug(prev => ({ ...prev, remote: 'Playing' }));
      };
      
      remoteVideoRef.current.onpause = () => {
        console.log('Remote video is paused');
      };
      
      remoteVideoRef.current.onerror = (e) => {
        console.error('Remote video error:', e);
      };
      
      // Force play in case autoplay is blocked
      remoteVideoRef.current.play()
        .then(() => console.log('Remote video play() successful'))
        .catch(e => console.log('Remote video play error:', e));
    }
  }, [remoteStream]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startConnection = async () => {
    try {
      console.log('Starting connection...');
      
      // Test if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia not supported');
        setConnectionState({ status: 'error' });
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: true 
      });
      
      console.log('Stream obtained:', stream);
      console.log('Stream active:', stream.active);
      console.log('Stream id:', stream.id);
      
      setLocalStream(stream);
      console.log('Local stream tracks:', stream.getTracks());
      stream.getTracks().forEach(track => {
        console.log('Track:', track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState);
      });
      
      console.log('Got local stream, finding partner...');
      console.log('Socket connected?', socket.connected);
      console.log('Socket id:', socket.id);
      socket.emit('find-partner');
      console.log('Emitted find-partner event');
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setConnectionState({ status: 'error' });
    }
  };

  const createPeerConnection = async (roomId: string, createOffer: boolean = true) => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };

    peerConnectionRef.current = new RTCPeerConnection(configuration);

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnectionRef.current?.addTrack(track, localStream);
      });
    }

    peerConnectionRef.current.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          candidate: event.candidate,
          roomId
        });
      }
    };

    if (createOffer) {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      
      socket.emit('offer', { offer, roomId });
    }
  };

  const handleDisconnect = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    setRemoteStream(null);
    setConnectionState({ status: 'idle' });
    setMessages([]);
    setShowChat(false);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const sendMessage = () => {
    if (inputMessage.trim() && connectionState.roomId) {
      socket.emit('chat-message', { message: inputMessage, roomId: connectionState.roomId });
      setMessages(prev => [...prev, { text: inputMessage, sender: 'me', timestamp: new Date() }]);
      setInputMessage('');
    }
  };

  const nextPartner = () => {
    if (connectionState.roomId) {
      socket.emit('leave-room', { roomId: connectionState.roomId });
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    setRemoteStream(null);
    setConnectionState({ status: 'waiting' });
    socket.emit('find-partner');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      {connectionState.status === 'idle' ? (
        /* Landing Screen */
        <div className="h-screen flex items-center justify-center relative overflow-hidden">
          {/* Animated Background */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-400/30 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-400/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
            <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-red-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }}></div>
          </div>
          
          <div className="relative z-10 text-center p-8">
            <div className="mb-8">
              <h1 className="text-6xl md:text-8xl font-black mb-4">
                <span className="bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
                  Hamster Chat
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-700">
                Connect with people worldwide instantly
              </p>
            </div>
            
            <button
              onClick={startConnection}
              className="group relative px-12 py-6 bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 rounded-full font-bold text-xl text-white overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-pink-500/25"
            >
              <span className="relative z-10 flex items-center gap-3">
                <Video className="w-7 h-7" />
                Start Chatting
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-pink-500 to-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
            
            <div className="mt-16 flex justify-center gap-12 text-center">
              <div>
                <div className="text-4xl font-bold text-yellow-500">1M+</div>
                <div className="text-gray-600 mt-1">Active Users</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-pink-500">50K+</div>
                <div className="text-gray-600 mt-1">Daily Matches</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Video Chat Screen - Modern Split View */
        <div className="h-screen flex flex-col">
          {/* Header */}
          <div className="bg-white shadow-lg px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
                Hamster Chat
              </h1>
              {connectionState.status === 'connected' && (
                <div className="flex items-center gap-2 bg-green-100 px-4 py-2 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-green-700 font-medium">{formatTime(timeElapsed)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Main Video Area */}
          <div className="flex-1 flex h-full">
            {/* Left Side - Partner/Remote Video */}
            <div className="flex-1 relative bg-black video-container" style={{ minHeight: '400px' }}>
              {/* Always render video element */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                style={{ 
                  backgroundColor: 'black',
                  minHeight: '100%',
                  minWidth: '100%'
                }}
                onLoadedMetadata={(e) => {
                  console.log('Remote video loaded metadata inline', e);
                  const video = e.target as HTMLVideoElement;
                  console.log('Video ready state:', video.readyState);
                }}
              />
              
              {/* Show waiting state when no remote stream */}
              {!remoteStream && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-100 to-red-100">
                  {connectionState.status === 'waiting' ? (
                    <div className="text-center p-8">
                      <div className="relative mb-8">
                        <div className="w-20 h-20 border-4 border-pink-500 rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-pink-500 rounded-full animate-pulse"></div>
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-800 mb-2">Finding your match...</h3>
                      <p className="text-gray-600">Hang tight! This usually takes 5-10 seconds</p>
                    </div>
                  ) : (
                    <p className="text-gray-600">Connecting...</p>
                  )}
                </div>
              )}
              
              {/* Partner Label */}
              {remoteStream && (
                <div className="absolute top-6 left-6 bg-pink-500 px-4 py-2 rounded-full shadow-lg">
                  <span className="text-sm font-bold text-white">Partner</span>
                </div>
              )}
              
              {/* Debug info for remote */}
              {remoteStream && (
                <div className="absolute bottom-6 left-6 bg-black/70 text-white p-2 rounded text-xs">
                  <div>Stream: {remoteStream ? 'Active' : 'None'}</div>
                  <div>Video tracks: {remoteStream.getVideoTracks().length}</div>
                  <div>Status: {videoDebug.remote || 'Waiting'}</div>
                </div>
              )}
            </div>

            {/* Right Side - Your Video */}
            <div className="flex-1 relative bg-black border-l-4 border-white video-container" style={{ minHeight: '400px' }}>
              {/* Always render video element */}
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ 
                  transform: 'scaleX(-1)',
                  backgroundColor: 'black',
                  minHeight: '100%',
                  minWidth: '100%'
                }}
                onLoadedMetadata={(e) => {
                  console.log('Local video loaded metadata inline', e);
                  const video = e.target as HTMLVideoElement;
                  console.log('Video ready state:', video.readyState);
                }}
              />
              
              {/* Show loading when no local stream */}
              {!localStream && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-yellow-100 to-pink-100">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-700">Initializing camera...</p>
                  </div>
                </div>
              )}
              
              {/* Show when video is off */}
              {localStream && isVideoOff && (
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-100 to-pink-100 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg">
                      <VideoOff className="w-12 h-12 text-pink-500" />
                    </div>
                    <p className="text-gray-700">Camera is off</p>
                  </div>
                </div>
              )}
              
              {/* You Label */}
              <div className="absolute top-6 left-6 bg-yellow-400 px-4 py-2 rounded-full shadow-lg">
                <span className="text-sm font-bold text-white">You</span>
              </div>
              
              {/* Debug info */}
              {localStream && (
                <div className="absolute bottom-6 left-6 bg-black/70 text-white p-2 rounded text-xs">
                  <div>Stream: {localStream ? 'Active' : 'None'}</div>
                  <div>Video tracks: {localStream.getVideoTracks().length}</div>
                  <div>Track enabled: {localStream.getVideoTracks()[0]?.enabled ? 'Yes' : 'No'}</div>
                  <div>Status: {videoDebug.local || 'Waiting'}</div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Control Bar */}
          <div className="bg-white shadow-lg p-4 border-t-4 border-pink-200">
            <div className="flex items-center justify-center gap-4">
              {/* Mic Button */}
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-all duration-200 shadow-lg hover:scale-110 ${
                  isMuted 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-yellow-400 hover:bg-yellow-500 text-white'
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              {/* Video Button */}
              <button
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-all duration-200 shadow-lg hover:scale-110 ${
                  isVideoOff 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-pink-500 hover:bg-pink-600 text-white'
                }`}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>

              {/* End Call Button */}
              <button
                onClick={handleDisconnect}
                className="p-5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 mx-4 shadow-lg hover:scale-110"
              >
                <Phone className="w-7 h-7 rotate-[135deg]" />
              </button>

              {/* Next Button */}
              {connectionState.status === 'connected' && (
                <button
                  onClick={nextPartner}
                  className="p-4 bg-gradient-to-r from-yellow-400 to-pink-500 hover:from-yellow-500 hover:to-pink-600 text-white rounded-full transition-all duration-200 shadow-lg hover:scale-110"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}

              {/* Chat Button */}
              <button
                onClick={() => setShowChat(!showChat)}
                className="p-4 bg-purple-500 hover:bg-purple-600 text-white rounded-full transition-all duration-200 relative shadow-lg hover:scale-110"
              >
                <MessageCircle className="w-6 h-6" />
                {messages.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                )}
              </button>
            </div>
          </div>

          {/* Chat Panel */}
          {showChat && (
            <div className="absolute bottom-24 right-4 w-96 h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-400 to-pink-500">
                <h3 className="font-bold text-white">Chat</h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm shadow-md ${
                        msg.sender === 'me'
                          ? 'bg-gradient-to-r from-yellow-400 to-pink-500 text-white'
                          : 'bg-white text-gray-800 border border-gray-200'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {connectionState.status === 'connected' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="p-4 bg-white border-t border-gray-200"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-gray-100 text-gray-800 px-4 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                    <button
                      type="submit"
                      className="p-2 bg-gradient-to-r from-yellow-400 to-pink-500 text-white rounded-full hover:scale-110 transition-transform"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error Modal */}
      {connectionState.status === 'error' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Camera Access Required</h2>
            <p className="text-gray-600 mb-6">
              Please allow camera and microphone access to start video chatting
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-gradient-to-r from-yellow-400 to-pink-500 text-white px-6 py-3 rounded-lg font-bold hover:scale-105 transition-transform"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;