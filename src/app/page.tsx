'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertCircle, Bot, User, Wand2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const promptStarters = [
  'Tell me about popular destinations in Egypt',
  'What are the must-visit places in Alexandria?',
  'Suggest a cultural tour in Cairo',
  'How can I plan a trip to multiple Egyptian cities?',
  "What's the best time to visit Egypt?",
];

export default function Chat() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    append,
  } = useChat({
    api: '/api/chat',
    onError: (error) => {
      console.error('Chat Error:', error);
    },
  });

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!isInitialized && messages.length === 0) {
      append({
        content:
          "Hi! I'm **Ithaka's** specialized AI travel assistant. How can I help you today? ",
        role: 'assistant',
      });
      setIsInitialized(true);
    }
  }, [isInitialized, messages, append]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await handleSubmit(e);
    } catch (err) {
      console.error('Submit Error:', err);
    }
  };

  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4'>
      <Card className='w-full max-w-2xl shadow-lg rounded-2xl overflow-hidden border-0'>
        <CardHeader className='bg-gradient-to-r from-blue-600 to-purple-600 text-white'>
          <CardTitle className='flex items-center gap-2'>
            <Wand2 className='w-6 h-6' />
            <span>Ithaka AI Travel Assistant</span>
          </CardTitle>
        </CardHeader>

        <CardContent className='h-[60vh] overflow-y-auto p-6 space-y-6 bg-white'>
          {error && (
            <Alert variant='destructive' className='mb-4'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>
                {error.message || 'An error occurred. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className='flex items-center gap-2 mb-2'>
                  {m.role === 'user' ? (
                    <User className='w-5 h-5' />
                  ) : (
                    <Bot className='w-5 h-5 text-purple-600' />
                  )}
                  <span className='text-sm font-medium'>
                    {m.role === 'user' ? 'You' : 'Ithaka AI'}
                  </span>
                </div>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  className={`prose ${
                    m.role === 'user' ? 'text-white' : 'text-gray-800'
                  } max-w-none`}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className='flex justify-start'>
              <div className='max-w-[80%] p-4 rounded-2xl bg-gray-100 text-gray-800'>
                <div className='flex items-center gap-2'>
                  <Bot className='w-5 h-5 text-purple-600 animate-pulse' />
                  <span className='text-sm font-medium'>
                    Ithaka AI is typing...
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className='flex flex-col space-y-4 p-6 bg-gray-50 border-t'>
          <div className='flex flex-wrap gap-2 justify-center'>
            {promptStarters.map((prompt, index) => (
              <Button
                key={index}
                variant='outline'
                onClick={() => append({ content: prompt, role: 'user' })}
                className='rounded-full bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-300 transition-all'
              >
                {prompt}
              </Button>
            ))}
          </div>

          <form onSubmit={onSubmit} className='flex w-full space-x-2'>
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder='Type your message...'
              className='flex-grow rounded-full bg-white border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
            />
            <Button
              type='submit'
              disabled={isLoading}
              className='rounded-full bg-blue-600 hover:bg-blue-700 text-white px-6 transition-all'
            >
              Send
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
