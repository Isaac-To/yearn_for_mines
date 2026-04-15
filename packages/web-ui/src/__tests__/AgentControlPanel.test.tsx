import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import AgentControlPanel from '../AgentControlPanel';

describe('AgentControlPanel', () => {
  it('should render start button', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="idle" />);
    expect(container.textContent).toContain('Start');
  });

  it('should send start_agent with goal on Start click', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="idle" />);

    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'gather wood' } });
    fireEvent.click(container.querySelector('button')!);

    expect(send).toHaveBeenCalledWith({ type: 'start_agent', data: { goal: 'gather wood' } });
  });

  it('should send stop_agent on Stop click', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="running" />);

    const buttons = container.querySelectorAll('button');
    const stopBtn = Array.from(buttons).find(b => b.textContent === 'Stop')!;
    fireEvent.click(stopBtn);

    expect(send).toHaveBeenCalledWith({ type: 'stop_agent' });
  });

  it('should send pause_agent on Pause click', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="running" />);

    const buttons = container.querySelectorAll('button');
    const pauseBtn = Array.from(buttons).find(b => b.textContent === 'Pause')!;
    fireEvent.click(pauseBtn);

    expect(send).toHaveBeenCalledWith({ type: 'pause_agent' });
  });

  it('should send resume_agent on Resume click', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="paused" />);

    const buttons = container.querySelectorAll('button');
    const resumeBtn = Array.from(buttons).find(b => b.textContent === 'Resume')!;
    fireEvent.click(resumeBtn);

    expect(send).toHaveBeenCalledWith({ type: 'resume_agent' });
  });

  it('should show agent state', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="running" />);
    expect(container.textContent).toContain('RUNNING');
  });

  it('should disable Start when not connected', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={false} send={send} agentState="idle" />);
    const input = container.querySelector('input')!;
    expect(input.disabled).toBe(true);
  });

  it('should not send start_agent when goal is empty', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="idle" />);

    const buttons = container.querySelectorAll('button');
    const startBtn = Array.from(buttons).find(b => b.textContent === 'Start')!;
    fireEvent.click(startBtn);

    expect(send).not.toHaveBeenCalled();
  });

  it('should send start_agent on Enter key in input', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="idle" />);

    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'mine cobblestone' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(send).toHaveBeenCalledWith({ type: 'start_agent', data: { goal: 'mine cobblestone' } });
  });

  it('should not send start_agent on non-Enter key', () => {
    const send = vi.fn();
    const { container } = render(<AgentControlPanel connected={true} send={send} agentState="idle" />);

    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'test goal' } });
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(send).not.toHaveBeenCalled();
  });
});