import * as vscode from 'vscode';

// https://code.visualstudio.com/api/extension-guides/language-model#send-the-language-model-request
const llmParams = { 'vendor': 'copilot', family: 'gpt-4o' };

export type LlmResult = { 
  value: string, 
  error?: string 
}

export const createUserMessage = (value: string): vscode.LanguageModelChatMessage => {
  return vscode.LanguageModelChatMessage.User(value);
};

const getLLM = async (): Promise<(vscode.LanguageModelChat | null)> => {
  const lm = await vscode.lm.selectChatModels(llmParams);

  if (!lm || !lm[0]) {

    return null;
  }

  return lm[0];
};

export const ask = async (messages: Array<vscode.LanguageModelChatMessage>, chunkReceived?: (value: any) => void, token?: vscode.CancellationToken): Promise<LlmResult> => {
  const llm = (await getLLM());

  if (!llm) {
    return { value: '', error: 'No language model found' };
  }

  const result = (await llm.sendRequest(messages, {}, token));
  
  let value = '';

  for await (const data of result.text) {    // collect response
    value += data;
    chunkReceived && chunkReceived(data);
  }

  return { value, error: '' };
};