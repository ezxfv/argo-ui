import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {FixedSizeList} from 'react-window';
import {Key, KeybindingContext, KeybindingProvider, useNav} from '../../shared';
import {Input, InputProps, SetInputFxn, useDebounce, useInput} from '../input/input';
import ThemeDiv from '../theme-div/theme-div';

import './autocomplete.scss';
import {Minimatch, IOptions} from 'minimatch';

export interface AutocompleteOption {
    value: string;
    label?: string;
}

interface AutocompleteHookProps extends InputProps {
    inputref?: React.MutableRefObject<HTMLInputElement>;
}

export const useAutocomplete = (init: string): [string, SetInputFxn, AutocompleteHookProps] => {
    const [state, setState, input] = useInput(init);
    const autocomplete = input as AutocompleteHookProps;
    if (autocomplete.ref) {
        autocomplete.inputref = input.ref;
        delete autocomplete.ref;
    }
    return [state, setState, autocomplete];
};

type NormalizedItem = AutocompleteOption;

function normalizeItems(items: (AutocompleteOption | string)[]): NormalizedItem[] {
    return (items || []).map((item) => {
        if (typeof item === 'string') {
            return {value: item, label: item};
        }
        return {value: item.value, label: item.label || item.value};
    });
}

const ITEM_HEIGHT = 32;
const MAX_LIST_HEIGHT = ITEM_HEIGHT * 10;

export const Autocomplete = (
    props: React.InputHTMLAttributes<HTMLInputElement> & {
        items: (AutocompleteOption | string)[];
        abbreviations?: Map<string, string>;
        inputStyle?: React.CSSProperties;
        onItemClick?: (item: string) => void;
        onSelect?: (value: string, item: AutocompleteOption) => void;
        renderInput?: (props: React.InputHTMLAttributes<HTMLInputElement> & {ref?: React.Ref<HTMLInputElement>}) => React.ReactNode;
        renderItem?: (item: AutocompleteOption, isSelected: boolean) => React.ReactNode;
        wrapperProps?: React.HTMLProps<HTMLDivElement>;
        icon?: string;
        inputref?: React.MutableRefObject<HTMLInputElement>;
        value: string;
        onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
        className?: string;
        style?: React.CSSProperties;
    }
) => {
    return (
        <KeybindingProvider>
            <RenderAutocomplete {...props} />
        </KeybindingProvider>
    );
};

export const RenderAutocomplete = (
    props: React.InputHTMLAttributes<HTMLInputElement> & {
        items: (AutocompleteOption | string)[];
        abbreviations?: Map<string, string>;
        inputStyle?: React.CSSProperties;
        onItemClick?: (item: string) => void;
        onSelect?: (value: string, item: AutocompleteOption) => void;
        renderInput?: (props: React.InputHTMLAttributes<HTMLInputElement> & {ref?: React.Ref<HTMLInputElement>}) => React.ReactNode;
        renderItem?: (item: AutocompleteOption, isSelected: boolean) => React.ReactNode;
        wrapperProps?: React.HTMLProps<HTMLDivElement>;
        icon?: string;
        inputref?: React.MutableRefObject<HTMLInputElement>;
        value: string;
        onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
        className?: string;
        style?: React.CSSProperties;
        glob?: boolean | IOptions;
    }
) => {
    const [curItems, setCurItems] = React.useState<NormalizedItem[]>([]);
    const nullInputRef = React.useRef<HTMLInputElement>(null);
    const inputRef = props.inputref || nullInputRef;
    const autocompleteRef = React.useRef(null);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [pos, nav, reset] = useNav(curItems.length);
    const menuRef = React.useRef(null);
    const listRef = React.useRef<FixedSizeList>(null);

    const frozenItemsRef = React.useRef<NormalizedItem[] | null>(null);
    const isSearchingRef = React.useRef(false);

    const getActiveItems = (): NormalizedItem[] => {
        if (isSearchingRef.current && frozenItemsRef.current) {
            return frozenItemsRef.current;
        }
        return normalizeItems(props.items);
    };

    const startSearch = () => {
        if (!isSearchingRef.current) {
            isSearchingRef.current = true;
            frozenItemsRef.current = normalizeItems(props.items);
        }
    };

    const endSearch = () => {
        isSearchingRef.current = false;
        frozenItemsRef.current = null;
    };

    React.useEffect(() => {
        function unfocus(e: any) {
            if (autocompleteRef.current && !autocompleteRef.current.contains(e.target) && menuRef.current && !menuRef.current.contains(e.target)) {
                setShowSuggestions(false);
                reset();
                endSearch();
            }
        }

        document.addEventListener('mousedown', unfocus);
        return () => document.removeEventListener('mousedown', unfocus);
    }, [autocompleteRef]);

    const debouncedVal = useDebounce(props.value as string, 350);

    React.useEffect(() => {
        const activeItems = getActiveItems();
        const searchValue = debouncedVal?.toLowerCase() || '';

        const filtered = activeItems.filter((item) => {
            if (!item.label) {
                return false;
            }

            const useGlob = typeof props.glob === 'boolean' ? props.glob : !!props.glob;
            const globOptions = typeof props.glob === 'boolean' ? null : props.glob;
            const globMatcher = useGlob && searchValue ? new Minimatch(searchValue, globOptions) : null;

            if (globMatcher) {
                return props.abbreviations !== undefined
                    ? globMatcher.match(item.label) || globMatcher.match(props.abbreviations?.get(item.value) ?? '')
                    : globMatcher.match(item.label);
            }

            return props.abbreviations !== undefined
                ? item.label.toLowerCase().includes(searchValue) || props.abbreviations.get(item.value)?.toLowerCase().includes(searchValue)
                : item.label.toLowerCase().includes(searchValue);
        });
        setCurItems(filtered.length > 0 ? filtered : activeItems);
    }, [debouncedVal]);

    React.useEffect(() => {
        if (!props.value || props.value === '') {
            endSearch();
        } else {
            setShowSuggestions(true);
        }
    }, [props.value]);

    const {useKeybinding} = React.useContext(KeybindingContext);

    const target = {
        combo: false,
        target: inputRef,
    };

    useKeybinding({
        keys: Key.TAB,
        action: () => {
            if (showSuggestions) {
                if (pos === curItems.length - 1) {
                    reset();
                }
                nav(1);
                return true;
            }
            return false;
        },
        ...target,
    });

    useKeybinding({
        keys: Key.ESCAPE,
        action: () => {
            if (showSuggestions) {
                reset();
                setShowSuggestions(false);
                endSearch();
                if (inputRef && inputRef.current) {
                    inputRef.current.blur();
                }
                return true;
            }
            return false;
        },
        ...target,
    });

    useKeybinding({
        keys: Key.ENTER,
        action: () => {
            if (showSuggestions && pos >= 0 && pos < curItems.length) {
                const item = curItems[pos];
                handleItemSelect(item);
                return true;
            }
            return false;
        },
        ...target,
    });

    useKeybinding({
        keys: Key.UP,
        action: () => {
            if (showSuggestions) {
                nav(-1);
                return false;
            }
            return true;
        },
        ...target,
    });

    useKeybinding({
        keys: Key.DOWN,
        action: () => {
            if (showSuggestions) {
                nav(1);
                return false;
            }
            return true;
        },
        ...target,
    });

    React.useEffect(() => {
        if (listRef.current && pos >= 0) {
            listRef.current.scrollToItem(pos, 'smart');
        }
    }, [pos]);

    const style = props.style;
    const trimmedProps = {...props};
    delete trimmedProps.style;
    delete trimmedProps.inputStyle;
    delete trimmedProps.onItemClick;
    delete trimmedProps.onSelect;
    delete trimmedProps.renderInput;
    delete trimmedProps.renderItem;
    delete trimmedProps.wrapperProps;

    const [position, setPosition] = React.useState({top: 0, left: 0, width: 0});

    const checkDirection = () => {
        if (autocompleteRef && autocompleteRef.current && menuRef.current) {
            if (inputRef.current && menuRef.current) {
                const rect = inputRef.current.getBoundingClientRect();
                const menuHeight = menuRef.current.clientHeight;
                const offset = window.innerHeight - rect.bottom;
                const inverted = offset < menuHeight;

                const newPos = {
                    top: inverted ? rect.top - menuRef.current.clientHeight : rect.top + rect.height,
                    left: rect.left,
                    width: rect.width,
                };
                if (position.left !== newPos.left || position.top !== newPos.top || position.width !== newPos.width) {
                    setPosition(newPos);
                }
            }
        }
    };

    React.useEffect(() => {
        checkDirection();
        document.addEventListener('scroll', checkDirection, true);
        document.addEventListener('resize', checkDirection, true);
        return () => {
            document.removeEventListener('scroll', checkDirection);
            document.removeEventListener('resize', checkDirection);
        };
    }, []);

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        startSearch();
        if (props.onChange) {
            props.onChange(e);
        }
    };

    const handleItemSelect = (item: NormalizedItem) => {
        onChange({target: {value: item.value}} as React.ChangeEvent<HTMLInputElement>);
        setShowSuggestions(false);
        endSearch();
        if (props.onSelect) {
            props.onSelect(item.value, item);
        }
        if (props.onItemClick) {
            props.onItemClick(item.value);
        }
    };

    const isVisible = showSuggestions && curItems.length > 0;
    const listHeight = Math.min(curItems.length * ITEM_HEIGHT, MAX_LIST_HEIGHT);

    const wrapperClassName = props.wrapperProps?.className || '';
    const wrapperStyle = props.wrapperProps?.style;

    const renderInputContent = () => {
        if (props.renderInput) {
            return props.renderInput({
                ...trimmedProps,
                style: props.inputStyle,
                ref: inputRef,
                className: (props.className || '') + ' autocomplete__input',
                onChange,
                onFocus: () => {
                    startSearch();
                    setShowSuggestions(true);
                    checkDirection();
                },
                value: props.value,
            } as any);
        }
        return (
            <Input
                {...trimmedProps}
                style={props.inputStyle}
                innerref={inputRef}
                className={(props.className || '') + ' autocomplete__input'}
                onChange={onChange}
                onFocus={() => {
                    startSearch();
                    setShowSuggestions(true);
                    checkDirection();
                }}
            />
        );
    };

    return (
        <div className={`autocomplete ${wrapperClassName}`} ref={autocompleteRef} style={{...(wrapperStyle as any), ...(style as any)}}>
            {renderInputContent()}

            {ReactDOM.createPortal(
                <ThemeDiv
                    className='autocomplete__items'
                    style={{
                        visibility: !isVisible ? 'hidden' : 'visible',
                        overflow: !isVisible ? 'hidden' : null,
                        top: position.top,
                        left: position.left,
                        width: position.width > 0 ? position.width : undefined,
                    }}
                    innerref={menuRef}>
                    {isVisible && (
                        <FixedSizeList
                            ref={listRef}
                            height={listHeight}
                            itemCount={curItems.length}
                            itemSize={ITEM_HEIGHT}
                            width='100%'>
                            {({index, style: rowStyle}: {index: number; style: React.CSSProperties}) => {
                                const item = curItems[index];
                                const isSelected = pos === index;
                                return (
                                    <div
                                        key={item.value}
                                        style={rowStyle}
                                        onClick={() => handleItemSelect(item)}
                                        className={`autocomplete__items__item ${isSelected ? 'autocomplete__items__item--selected' : ''}`}>
                                        {props.renderItem ? props.renderItem(item, isSelected) : item.label}
                                    </div>
                                );
                            }}
                        </FixedSizeList>
                    )}
                </ThemeDiv>,
                document.body
            )}
        </div>
    );
};
