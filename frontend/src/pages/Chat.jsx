/**
 * Chat Page
 * Real-time messaging for maintenance requests
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { subscribeToMessages, sendMessage, getChatRoomByRequestId, getChatRoomById, deleteMessage } from '../api/messaging';

export default function Chat() {
  const { requestId, roomId: directRoomId } = useParams();
  const location = useLocation();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [chatTitle, setChatTitle] = useState('Chat');
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const isDirectChat = location.pathname.includes('/chat/direct/');

  useEffect(() => {
    loadChatRoom();
  }, [requestId, directRoomId, isDirectChat]);

  useEffect(() => {
    if (roomId) {
      const unsubscribe = subscribeToMessages(roomId, (msgs) => {
        setMessages(msgs);
      });
      return () => unsubscribe();
    }
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChatRoom = async () => {
    try {
      if (isDirectChat && directRoomId) {
        // Direct chat - load by room ID
        const room = await getChatRoomById(directRoomId);
        if (room) {
          setRoomId(room.id);
          setChatTitle('Direct Message');
        } else {
          alert('Chat room not found');
          navigate('/dashboard');
        }
      } else if (requestId) {
        // Maintenance request chat
        const room = await getChatRoomByRequestId(requestId);
        if (room) {
          setRoomId(room.id);
          setChatTitle(`Chat - Request #${requestId.substring(0, 8)}`);
        } else {
          alert('Chat room not found');
          navigate('/dashboard');
        }
      }
    } catch (error) {
      console.error('Error loading chat room:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !roomId) return;

    try {
      await sendMessage(roomId, currentUser.uid, newMessage);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!roomId || !window.confirm('Are you sure you want to delete this message?')) {
      return;
    }

    try {
      await deleteMessage(roomId, messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message: ' + error.message);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-gray-900">{chatTitle}</h1>
            <div className="flex items-center gap-4">
              {requestId && (
                <Link
                  to={`/maintenance/${requestId}`}
                  className="text-blue-600 hover:text-blue-700 text-sm"
                >
                  View Request
                </Link>
              )}
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-700 hover:text-gray-900"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl mx-auto w-full p-4 flex flex-col">
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((message) => {
                const isOwnMessage = message.senderId === currentUser.uid;
                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      isOwnMessage ? 'justify-end' : 'justify-start'
                    }`}
                    onMouseEnter={() => setHoveredMessageId(message.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative group ${
                        isOwnMessage
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      {isOwnMessage && hoveredMessageId === message.id && (
                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-lg transition"
                          title="Delete message"
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                      <p className="text-sm">{message.text}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isOwnMessage
                            ? 'text-blue-100'
                            : 'text-gray-500'
                        }`}
                      >
                        {message.timestamp?.toDate().toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={handleSendMessage} className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

