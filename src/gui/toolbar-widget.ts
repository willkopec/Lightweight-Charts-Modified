import { IDestroyable } from '../helpers/idestroyable';

export interface ToolbarCallbacks {
    onTrendlineToolToggle: (active: boolean) => void;
    onFibonacciToolToggle: (active: boolean) => void;
    onIndicatorAdd: (indicatorType: string) => void;
}

export class ToolbarWidget implements IDestroyable {
    private _element: HTMLDivElement;
    private _callbacks: ToolbarCallbacks;
    private _trendlineButton: HTMLButtonElement | null = null;
    private _fibonacciButton: HTMLButtonElement | null = null;
    private _indicatorButton: HTMLButtonElement | null = null;
    private _indicatorDropdown: HTMLDivElement | null = null;
    private _isTrendlineActive: boolean = false;
    private _isFibonacciActive: boolean = false;
    private _isDropdownOpen: boolean = false;

    public constructor(callbacks: ToolbarCallbacks) {
        this._callbacks = callbacks;
        this._element = document.createElement('div');
        this._element.classList.add('tv-lightweight-charts-toolbar');
        
        // Toolbar styling
        this._element.style.position = 'absolute';
        this._element.style.top = '8px';
        this._element.style.left = '8px';
        this._element.style.zIndex = '10';
        this._element.style.backgroundColor = '#131722';
        this._element.style.borderRadius = '4px';
        this._element.style.padding = '4px';
        this._element.style.display = 'flex';
        this._element.style.gap = '4px';
        this._element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';

        this._createTrendlineButton();
        this._createFibonacciButton();
        this._createIndicatorButton();

        // Close dropdown when clicking outside
        document.addEventListener('click', this._handleDocumentClick.bind(this));
    }

    public getElement(): HTMLDivElement {
        return this._element;
    }

    public destroy(): void {
        document.removeEventListener('click', this._handleDocumentClick.bind(this));
        
        if (this._element.parentElement !== null) {
            this._element.parentElement.removeChild(this._element);
        }
    }

    public deactivateTrendlineTool(): void {
        this._isTrendlineActive = false;
        this._updateTrendlineButtonState();
    }

    public deactivateFibonacciTool(): void {
        this._isFibonacciActive = false;
        this._updateFibonacciButtonState();
    }

    private _createTrendlineButton(): void {
        const button = document.createElement('button');
        this._trendlineButton = button;
        
        button.style.width = '32px';
        button.style.height = '32px';
        button.style.border = 'none';
        button.style.backgroundColor = 'transparent';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.color = '#B2B5BE';
        button.title = 'Trendline';

        // Simple trendline icon (diagonal line)
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="2"/>
            </svg>
        `;

        // Click handler
        button.addEventListener('click', () => {
            // Deactivate fibonacci tool if active
            if (this._isFibonacciActive) {
                this._isFibonacciActive = false;
                this._updateFibonacciButtonState();
                this._callbacks.onFibonacciToolToggle(false);
            }
            
            // Close indicator dropdown if open
            this._closeDropdown();
            
            this._isTrendlineActive = !this._isTrendlineActive;
            this._updateTrendlineButtonState();
            this._callbacks.onTrendlineToolToggle(this._isTrendlineActive);
        });

        // Hover effect
        button.addEventListener('mouseenter', () => {
            if (!this._isTrendlineActive) {
                button.style.backgroundColor = '#2A2E39';
            }
        });
        
        button.addEventListener('mouseleave', () => {
            this._updateTrendlineButtonState();
        });

        this._element.appendChild(button);
    }

    private _createFibonacciButton(): void {
        const button = document.createElement('button');
        this._fibonacciButton = button;
        
        button.style.width = '32px';
        button.style.height = '32px';
        button.style.border = 'none';
        button.style.backgroundColor = 'transparent';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.color = '#B2B5BE';
        button.title = 'Fibonacci Retracement';

        // Fibonacci icon (horizontal lines with golden ratio symbol)
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1"/>
                <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1"/>
                <line x1="2" y1="9" x2="14" y2="9" stroke="currentColor" stroke-width="1"/>
                <line x1="2" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1"/>
                <text x="8" y="8" font-size="6" text-anchor="middle" fill="currentColor">φ</text>
            </svg>
        `;

        // Click handler
        button.addEventListener('click', () => {
            // Deactivate trendline tool if active
            if (this._isTrendlineActive) {
                this._isTrendlineActive = false;
                this._updateTrendlineButtonState();
                this._callbacks.onTrendlineToolToggle(false);
            }
            
            // Close indicator dropdown if open
            this._closeDropdown();
            
            this._isFibonacciActive = !this._isFibonacciActive;
            this._updateFibonacciButtonState();
            this._callbacks.onFibonacciToolToggle(this._isFibonacciActive);
        });

        // Hover effect
        button.addEventListener('mouseenter', () => {
            if (!this._isFibonacciActive) {
                button.style.backgroundColor = '#2A2E39';
            }
        });
        
        button.addEventListener('mouseleave', () => {
            this._updateFibonacciButtonState();
        });

        this._element.appendChild(button);
    }

    private _createIndicatorButton(): void {
        const container = document.createElement('div');
        container.style.position = 'relative';
        container.style.display = 'inline-block';

        const button = document.createElement('button');
        this._indicatorButton = button;
        
        button.style.width = '32px';
        button.style.height = '32px';
        button.style.border = 'none';
        button.style.backgroundColor = 'transparent';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.color = '#B2B5BE';
        button.title = 'Add Indicator';

        // Indicator icon (chart with line going through it)
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="3" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
                <path d="M3 11 L6 8 L9 9 L13 5" stroke="currentColor" stroke-width="1.5" fill="none"/>
                <circle cx="6" cy="8" r="1" fill="currentColor"/>
                <circle cx="9" cy="9" r="1" fill="currentColor"/>
                <text x="8" y="2" font-size="8" text-anchor="middle" fill="currentColor">+</text>
            </svg>
        `;

        // Click handler
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Deactivate other tools if active
            if (this._isTrendlineActive) {
                this._isTrendlineActive = false;
                this._updateTrendlineButtonState();
                this._callbacks.onTrendlineToolToggle(false);
            }
            
            if (this._isFibonacciActive) {
                this._isFibonacciActive = false;
                this._updateFibonacciButtonState();
                this._callbacks.onFibonacciToolToggle(false);
            }
            
            this._toggleDropdown();
        });

        // Hover effect
        button.addEventListener('mouseenter', () => {
            if (!this._isDropdownOpen) {
                button.style.backgroundColor = '#2A2E39';
            }
        });
        
        button.addEventListener('mouseleave', () => {
            if (!this._isDropdownOpen) {
                button.style.backgroundColor = 'transparent';
            }
        });

        container.appendChild(button);
        this._createIndicatorDropdown(container);
        this._element.appendChild(container);
    }

    private _createIndicatorDropdown(container: HTMLElement): void {
        const dropdown = document.createElement('div');
        this._indicatorDropdown = dropdown;
        
        dropdown.style.position = 'absolute';
        dropdown.style.top = '36px';
        dropdown.style.left = '0';
        dropdown.style.backgroundColor = '#131722';
        dropdown.style.border = '1px solid #2A2E39';
        dropdown.style.borderRadius = '4px';
        dropdown.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
        dropdown.style.minWidth = '120px';
        dropdown.style.display = 'none';
        dropdown.style.zIndex = '20';

        // Create RSI option
        const rsiOption = this._createDropdownOption('RSI', 'Relative Strength Index');
        rsiOption.addEventListener('click', () => {
            this._callbacks.onIndicatorAdd('RSI');
            this._closeDropdown();
        });

        dropdown.appendChild(rsiOption);
        container.appendChild(dropdown);
    }

    private _createDropdownOption(label: string, description: string): HTMLElement {
        const option = document.createElement('div');
        option.style.padding = '8px 12px';
        option.style.cursor = 'pointer';
        option.style.color = '#B2B5BE';
        option.style.fontSize = '12px';
        option.style.borderBottom = '1px solid #2A2E39';

        const labelDiv = document.createElement('div');
        labelDiv.textContent = label;
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.marginBottom = '2px';

        const descDiv = document.createElement('div');
        descDiv.textContent = description;
        descDiv.style.fontSize = '10px';
        descDiv.style.color = '#848E9C';

        option.appendChild(labelDiv);
        option.appendChild(descDiv);

        // Hover effect
        option.addEventListener('mouseenter', () => {
            option.style.backgroundColor = '#2A2E39';
        });

        option.addEventListener('mouseleave', () => {
            option.style.backgroundColor = 'transparent';
        });

        return option;
    }

    private _toggleDropdown(): void {
        if (this._isDropdownOpen) {
            this._closeDropdown();
        } else {
            this._openDropdown();
        }
    }

    private _openDropdown(): void {
        if (this._indicatorDropdown) {
            this._indicatorDropdown.style.display = 'block';
            this._isDropdownOpen = true;
            
            if (this._indicatorButton) {
                this._indicatorButton.style.backgroundColor = '#2A2E39';
            }
        }
    }

    private _closeDropdown(): void {
        if (this._indicatorDropdown) {
            this._indicatorDropdown.style.display = 'none';
            this._isDropdownOpen = false;
            
            if (this._indicatorButton) {
                this._indicatorButton.style.backgroundColor = 'transparent';
            }
        }
    }

    private _handleDocumentClick(event: Event): void {
        if (this._isDropdownOpen && !this._element.contains(event.target as Node)) {
            this._closeDropdown();
        }
    }

    private _updateTrendlineButtonState(): void {
        if (!this._trendlineButton) return;
        
        if (this._isTrendlineActive) {
            this._trendlineButton.style.backgroundColor = '#2962FF';
            this._trendlineButton.style.color = '#FFFFFF';
        } else {
            this._trendlineButton.style.backgroundColor = 'transparent';
            this._trendlineButton.style.color = '#B2B5BE';
        }
    }

    private _updateFibonacciButtonState(): void {
        if (!this._fibonacciButton) return;
        
        if (this._isFibonacciActive) {
            this._fibonacciButton.style.backgroundColor = '#2962FF';
            this._fibonacciButton.style.color = '#FFFFFF';
        } else {
            this._fibonacciButton.style.backgroundColor = 'transparent';
            this._fibonacciButton.style.color = '#B2B5BE';
        }
    }
}