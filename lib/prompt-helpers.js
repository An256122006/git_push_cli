import { input, select } from '@inquirer/prompts';

export const BACK = '__back__';
export const BACK_TOKENS = new Set(['..', '/back', '<<']);

export function isBackInput(v) {
  return BACK_TOKENS.has(String(v || '').trim());
}

/**
 * Prompt select có sẵn lựa chọn « Quay lại
 * @param {object} params
 * @returns {Promise<any>}
 */
export async function selectWithBack({ message, choices, pageSize, ...rest }) {
  const hasBack = (choices || []).some((c) => c && c.value === BACK);
  const finalChoices = hasBack
    ? choices
    : [
        ...choices,
        { name: '« Quay lại (bước trước)', value: BACK, description: 'Về bước trước / menu chính' }
      ];
  return await select({
    message,
    choices: finalChoices,
    pageSize: pageSize || Math.min(12, finalChoices.length + 2),
    ...rest
  });
}

/**
 * Prompt input có hướng dẫn gõ ".." để quay lại
 * @param {object} params
 * @returns {Promise<string>}
 */
export async function inputWithBack({ message, validate, ...rest }) {
  const hinted = `${message}  [gõ ".." để quay lại]`;
  const wrappedValidate = (val) => {
    if (isBackInput(val)) return true;
    if (validate) return validate(val);
    return true;
  };
  const val = await input({ message: hinted, validate: wrappedValidate, ...rest });
  if (isBackInput(val)) return BACK;
  return val;
}

/**
 * Hỏi Tiếp tục / Quay lại menu / Thoát sau mỗi tác vụ hoặc khi gặp lỗi.
 * @param {string} message
 * @returns {Promise<'continue' | 'back' | 'exit'>}
 */
export async function promptContinueOrBack(message = 'Bạn muốn tiếp tục hay quay lại?') {
  return await select({
    message,
    choices: [
      { name: 'Tiếp tục', value: 'continue', description: 'Đi tiếp bước kế tiếp' },
      { name: 'Quay lại bảng điều khiển', value: 'back', description: 'Về màn hình chọn hành động' },
      { name: 'Thoát', value: 'exit', description: 'Dừng, không làm gì' }
    ]
  });
}
