'use strict';

/* globals define, socket, app, config, ajaxify, utils, templates, bootbox */

define('quill-nbb', [
    'quill',
    'composer',
    'translator',
    'composer/autocomplete',
    'composer/resize',
    'composer/formatting',
    'components',
], function (Quill, composer, translator, autocomplete, resize, formatting, components) {
    var quillNbb = {
        uploads: {},
    };

    function init (targetEl, data, callback) {
        var textDirection = $('html').attr('data-dir');
        var textareaEl = targetEl.siblings('textarea');
        var toolbarOptions = {
            container: [
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],      // h1..h6
                ['bold', 'italic', 'underline', 'strike'],      // toggled buttons
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'script': 'sub'}, { 'script': 'super' }],    // superscript/subscript
                [{ 'color': [] }, { 'background': [] }],        // dropdown with defaults from theme
                [{ 'align': [] }],
                ['clean']
            ],
            handlers: {},
        };

        // Configure toolbar
        var toolbarHandlers = formatting.getDispatchTable();
        var group = [];
        data.formatting.forEach(function (option) {
            group.push(option.name);
            if (toolbarHandlers[option.name]) {
                toolbarOptions.handlers[option.name] = toolbarHandlers[option.name].bind(targetEl);
            }
        });
        // -- upload privileges
        ['upload:post:file', 'upload:post:image'].forEach(function (privilege) {
            if (app.user.privileges[privilege]) {
                var name = privilege === 'upload:post:image' ? 'picture' : 'upload';
                group.unshift(name);
                toolbarOptions.handlers[name] = toolbarHandlers[name].bind($('.formatting-bar'));
            }
        });
        toolbarOptions.container.push(group);

        // Quill...
        var quill = new Quill(targetEl.get(0), {
            theme: data.theme || 'snow',
            modules: {
                toolbar: toolbarOptions,
            }
        });
        targetEl.data('quill', quill);
        targetEl.find('.ql-editor').addClass('write');

        // Configure toolbar icons (must be done after quill itself is instantiated)
        var toolbarEl = targetEl.siblings('.ql-toolbar').length ? targetEl.siblings('.ql-toolbar') : targetEl.find('.ql-toolbar');
        data.formatting.forEach(function (option) {
            var buttonEl = toolbarEl.find('.ql-' + option.name);
            buttonEl.html('<i class="' + option.className + '"></i>');
            if (option.mobile) {
                buttonEl.addClass('visible-xs');
            }
        });
        ['upload:post:image', 'upload:post:file'].forEach(function (privilege) {
            if (app.user.privileges[privilege]) {
                var className = privilege === 'upload:post:image' ? 'picture' : 'upload';
                var buttonEl = toolbarEl.find('.ql-' + className);
                buttonEl.html('<i class="fa fa' + (privilege === 'upload:post:image' ? '-cloud' : '') + '-upload"></i>');
            }
        });

        // Automatic RTL support
        quill.format('direction', textDirection);
        quill.format('align', textDirection === 'rtl' ? 'right' : 'left');

        $(window).trigger('action:quill.load', quill);
        $(window).off('action:quill.load');

        // Restore text if contained in composerData
        if (data.composerData && data.composerData.body) {
            try {
                var unescaped = data.composerData.body.replace(/&quot;/g, '"');
                quill.setContents(JSON.parse(unescaped), 'api');
            } catch (e) {
                quill.setContents({"ops":[{"insert": data.composerData.body.toString()}]}, 'api');
            }
        }

        // Update textarea on text-change event. This allows compatibility with
        // how NodeBB handles things like drafts, etc.
        quill.on('text-change', function () {
            textareaEl.val(JSON.stringify(quill.getContents()));
        });

        // Handle tab/enter for autocomplete
        var doAutocomplete = function () {
            return !$('.composer-autocomplete-dropdown-' + data.post_uuid + ':visible').length;
        };
        [9, 13].forEach(function (keyCode) {
            quill.keyboard.addBinding({
                key: keyCode,
            }, doAutocomplete);
            quill.keyboard.bindings[keyCode].unshift(quill.keyboard.bindings[keyCode].pop());
        });

        // var options = {
        //     direction: textDirection || undefined,
        //     imageUploadFields: {
        //         '_csrf': config.csrf_token
        //     },
        //     fileUploadFields: {
        //         '_csrf': config.csrf_token
        //     },
        // };

        if (typeof callback === 'function') {
            callback();
        }
    };

    $(window).on('action:composer.loaded', function (ev, data) {
        var postContainer = $('.composer[data-uuid="' + data.post_uuid + '"]')
        var targetEl = postContainer.find('.write-container div');

        init(targetEl, data);

        var cidEl = postContainer.find('.category-list');
        if (cidEl.length) {
          cidEl.attr('id', 'cmp-cid-' + data.post_uuid);
        } else {
          postContainer.append('<input id="cmp-cid-' + data.post_uuid + '" type="hidden" value="' + ajaxify.data.cid + '"/>');
        }

        // if (config.allowTopicsThumbnail && data.composerData.isMain) {
        //   var thumbToggleBtnEl = postContainer.find('.re-topic_thumb');
        //   var url = data.composerData.topic_thumb || '';

        //   postContainer.find('input#topic-thumb-url').val(url);
        //   postContainer.find('img.topic-thumb-preview').attr('src', url);

        //   if (url) {
        //     postContainer.find('.topic-thumb-clear-btn').removeClass('hide');
        //   }
        //   thumbToggleBtnEl.addClass('show');
        //   thumbToggleBtnEl.off('click').on('click', function() {
        //     var container = postContainer.find('.topic-thumb-container');
        //     container.toggleClass('hide', !container.hasClass('hide'));
        //   });
        // }

        autocomplete.init(postContainer, data.post_uuid);
        resize.reposition(postContainer);
    });

    $(window).on('action:chat.loaded', function (e, containerEl) {
        // Create div element for composer
        var targetEl = $('<div></div>').insertBefore(components.get('chat/input'));

        var onInit = function () {
            autocomplete.init($(containerEl));
        }

        // Load formatting options into DOM on-demand
        if (composer.formatting) {
            init(targetEl, {
                formatting: composer.formatting,
                theme: 'bubble',
            }, onInit);
        } else {
            socket.emit('plugins.composer.getFormattingOptions', function(err, options) {
                composer.formatting = options;
                init(targetEl, {
                    formatting: composer.formatting,
                    theme: 'bubble',
                }, onInit);
            });
        }
    });

    $(window).on('action:chat.sent', function (e, data) {
        // Empty chat input
        var quill = $('.chat-modal[data-roomid="' + data.roomId + '"] .ql-container, .expanded-chat[data-roomid="' + data.roomId + '"] .ql-container').data('quill');
        quill.deleteText(0, quill.getLength());
    });

    $(window).on('action:composer.uploadUpdate', function (e, data) {
        var quill = components.get('composer').filter('[data-uuid="' + data.post_uuid + '"]').find('.ql-container').data('quill');
        var alertId = utils.slugify([data.post_uuid, data.filename].join('-'));

        if (data.text.startsWith('/')) {
            app.removeAlert(alertId);

            // Image vs. file upload
            if (quillNbb.uploads[data.filename].isImage) {
                quill.insertEmbed(quill.getSelection().index, 'image', window.location.origin + data.text);
            } else {
                var selection = quill.getSelection();

                if (selection.length) {
                    var linkText = quill.getText(selection.index, selection.length);
                    quill.deleteText(selection.index, selection.length);
                    quill.insertText(selection.index, linkText, {
                        link: data.text
                    });
                } else {
                    quill.insertText(selection.index, data.filename, {
                        link: data.text
                    });
                }
            }

            delete quillNbb.uploads[data.filename];
        } else {
            app.alert({
                alert_id: alertId,
                title: data.filename.replace(/\d_\d+_/, ''),
                message: data.text,
                timeout: 1000,
            });
        }
    });

    $(window).on('action:composer.uploadStart', function (e, data) {
        data.files.forEach(function (file) {
            app.alert({
                alert_id: utils.slugify([data.post_uuid, file.filename].join('-')),
                title: file.filename.replace(/\d_\d+_/, ''),
                message: data.text,
            });
            quillNbb.uploads[file.filename] = {
                isImage: file.isImage,
            };
        });
    });
});
