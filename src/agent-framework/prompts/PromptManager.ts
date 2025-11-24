import { AgentType } from '../core/types';
import { PLANNER_TEMPLATE, EXECUTOR_TEMPLATE, VERIFIER_TEMPLATE } from './templates';

export class PromptManager {
  private templates: Map<AgentType, string> = new Map();
  private systemContext: string = '';

  constructor() {
    // Load default templates
    this.templates.set('planner', PLANNER_TEMPLATE);
    this.templates.set('executor', EXECUTOR_TEMPLATE);
    this.templates.set('verifier', VERIFIER_TEMPLATE);
  }

  /**
   * Set system context specific to the application
   */
  setSystemContext(context: string) {
    this.systemContext = context;
  }

  /**
   * Override default template for an agent type
   */
  setTemplate(type: AgentType, template: string) {
    this.templates.set(type, template);
  }

  /**
   * Get the processed prompt for an agent type
   */
  getPrompt(type: AgentType): string {
    const template = this.templates.get(type);
    if (!template) {
      throw new Error(`No template found for agent type: ${type}`);
    }

    return this.processTemplate(template);
  }

  private processTemplate(template: string): string {
    return template.replace(/{{systemContext}}/g, this.systemContext);
  }
}

