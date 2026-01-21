/**
 * OnboardingTour Component
 * 
 * Multi-step guided tour showcasing app features
 * Beautiful modal with progress indicator
 */

import { useOnboarding, OnboardingStep } from '../hooks/useOnboarding';
import { Button } from './primitives';
import './OnboardingTour.css';

interface StepContent {
  title: string;
  description: string;
  image?: string;
  tips?: string[];
  action?: {
    label: string;
    onClick: () => void;
  };
}

const STEP_CONTENT: Record<OnboardingStep, StepContent> = {
  welcome: {
    title: '🎉 Welcome to SignalX!',
    description: 'Your powerful Signal desktop client with advanced features.',
    tips: [
      '📨 Send messages with confidence',
      '🔄 Automatic retry on failures',
      '📊 Real-time status updates',
      '⚡ Never lose a message',
    ],
  },
  'account-select': {
    title: '👤 Choose Your Account',
    description: 'Select the Signal account you want to use.',
    tips: [
      'You can switch accounts anytime',
      'Multiple accounts supported',
    ],
  },
  'feature-tour': {
    title: '✨ What\'s New',
    description: 'We\'ve added some amazing features to make messaging better!',
    tips: [
      '🎯 Real-time message status tracking',
      '🔄 Smart automatic retries (up to 10 attempts)',
      '💾 Zero data loss with persistent queue',
      '⚠️ Clear error notifications',
      '📊 Live queue statistics',
    ],
  },
  'outbox-intro': {
    title: '📤 Outbox Status',
    description: 'Watch your messages in action! The outbox status appears in the bottom-right corner.',
    tips: [
      '🟣 Queued - Message is waiting',
      '🔵 Sending - Currently being sent',
      '✅ Sent - Success!',
      '🔴 Failed - Will retry automatically',
    ],
  },
  'message-status': {
    title: '💬 Message Status',
    description: 'Every message shows its current status with clear visual indicators.',
    tips: [
      'See exactly when messages are sent',
      'Get notified of delivery',
      'Know if something goes wrong',
      'Track retry attempts',
    ],
  },
  'retry-system': {
    title: '🔄 Smart Retry Logic',
    description: 'Messages never get lost! If sending fails, we automatically retry.',
    tips: [
      '10 automatic retry attempts',
      'Exponential backoff (smart delays)',
      'Persistent queue (survives app restart)',
      'Dead Letter Queue for permanent failures',
    ],
  },
  'first-message': {
    title: '🚀 Ready to Send!',
    description: 'Try sending your first message and watch the magic happen!',
    tips: [
      '1. Select a contact or thread',
      '2. Type your message',
      '3. Hit send',
      '4. Watch the status in the bottom-right!',
    ],
  },
  complete: {
    title: '🎊 All Set!',
    description: 'You\'re ready to use SignalX. Enjoy reliable, feature-rich messaging!',
    tips: [
      'Check Settings for more options',
      'Look for hints throughout the app',
      'Replay this tour anytime from Settings',
    ],
  },
};

export function OnboardingTour() {
  const { isActive, currentStep, nextStep, previousStep, skipTour, completeTour } = useOnboarding();

  if (!isActive) return null;

  // Skip account-select in tour (handled by WelcomeOverlay)
  if (currentStep === 'account-select') {
    return null;
  }

  const content = STEP_CONTENT[currentStep];
  const isFirst = currentStep === 'welcome';
  const isLast = currentStep === 'complete';

  return (
    <div className="onboarding-tour-overlay">
      <div className="onboarding-tour-modal">
        {/* Header */}
        <div className="onboarding-tour-header">
          <h2>{content.title}</h2>
          <button
            className="onboarding-tour-close"
            onClick={skipTour}
            aria-label="Skip tour"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="onboarding-tour-content">
          <p className="onboarding-tour-description">{content.description}</p>

          {content.tips && content.tips.length > 0 && (
            <ul className="onboarding-tour-tips">
              {content.tips.map((tip, index) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          )}

          {/* Visual highlight for specific steps */}
          {currentStep === 'outbox-intro' && (
            <div className="onboarding-tour-highlight">
              <div className="onboarding-tour-arrow">↘️</div>
              <p>Look at the bottom-right corner!</p>
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        <div className="onboarding-tour-progress">
          {['welcome', 'feature-tour', 'outbox-intro', 'message-status', 'retry-system', 'first-message', 'complete'].map((step) => (
            <div
              key={step}
              className={`onboarding-tour-progress-dot ${
                currentStep === step ? 'active' : ''
              } ${
                ['welcome', 'feature-tour', 'outbox-intro', 'message-status', 'retry-system', 'first-message', 'complete'].indexOf(currentStep) >
                ['welcome', 'feature-tour', 'outbox-intro', 'message-status', 'retry-system', 'first-message', 'complete'].indexOf(step as OnboardingStep)
                  ? 'completed'
                  : ''
              }`}
            />
          ))}
        </div>

        {/* Footer Actions */}
        <div className="onboarding-tour-footer">
          {!isFirst && (
            <Button
              variant="secondary"
              onClick={previousStep}
            >
              Back
            </Button>
          )}
          
          <div style={{ flex: 1 }} />

          {!isLast && (
            <Button
              variant="secondary"
              onClick={skipTour}
            >
              Skip Tour
            </Button>
          )}

          <Button
            variant="primary"
            onClick={isLast ? completeTour : nextStep}
          >
            {isLast ? 'Get Started!' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
