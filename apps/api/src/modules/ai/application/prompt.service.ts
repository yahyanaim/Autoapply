import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PromptService {
  loadTemplate(templateName: string): string {
    if (!/^[a-z0-9-]+\.v\d+$/.test(templateName)) {
      throw new Error('Invalid prompt template name');
    }

    const promptDirectories = [
      path.join(__dirname, '..', 'prompts'),
      path.join(process.cwd(), 'src/modules/ai/prompts'),
      path.join(process.cwd(), 'apps/api/src/modules/ai/prompts'),
    ];
    for (const directory of promptDirectories) {
      const filePath = path.join(directory, `${templateName}.md`);
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
    }

    throw new Error(`Prompt template ${templateName} was not found`);
  }
}
