var replies_loaded = [];

function is_in(list, item) {
    for (var i = 0; i < list.length; i++) {
        if (list[i] == item) {
            return true;
        }
    }
    return false;
}

jQuery(document).ready(function($) {
    function update_replies_count(nxt) {
        var parents = nxt.parents('.comment');

        parents.each(function() {
            var item = $("#" + this.id + " > .comment_outer > .comment_content > .comment_reply_links > .comment_replies ");
            var count = parseInt(item.data('commentscount'), 10) + 1;
            item.data('commentscount', count);
            var d = {
                count: count
            };
            item.text(interpolate(ngettext('%(count)s reply', '%(count)s replies', d.count), d, true));
        });
    }

    function append_data_and_rebind_form(node, data) {
        node.empty();
        node.append(data);
        node.slideDown("slow");

        var form = $("form", node);
        bind_submit(form, node);
    }
    
    function ajax_error(nxt, data, textStatus) {    
        status = data.status;
        data = data.responseText;
        // User is not logged in or some other error.
        // If it's a 403, we assume the HTML content is safe and 
        // was generated by our ajax_login_required decorator, so
        // we can re-use it.
        // If not, just use a standard error message.
        
        if (status != 403 || data == "") {
            data = gettext('An unexpected error occured. Please try again in a few minutes');
        }
        form = $('form', nxt);
        classname = "error_ajax"
        if (form.length) {
            $(':input', form).attr('disabled', true);
            form.addClass('disabled');
            classname += "_form"
        }
        if (!$('.' + classname, nxt).length) {
            nxt.append('<div class="' + classname + '">' + data + '</div>');
        } else {
            $('.' + classname, nxt).html(data);
        }
    }    

    function bind_submit(form, nxt) {
        var post_data = {};

        $("input[type=submit]", form).bind("mousedown", function() {
            post_data = {};
            post_data[this.name] = this.value;
        });

        form.bind("submit", function() {
            var data_dict = $(":input", form).serializeArray();

            $.each(data_dict, function() {
                post_data[this.name] = this.value;
            });
            post_data['is_ajax'] = 1;
            $.ajax({
                type: 'POST',
                url: form.attr('action'),
                data: post_data,
                dataType: 'html',
                error: function(data, textStatus, xhrobject) {
                    return ajax_error(nxt, data, textStatus);
                },
                success: function(data, textStatus, xhrobject) {
                    if (xhrobject.status == 201 || xhrobject.status == 202) {
                        // we are posting a real comment, not a pre-visualization
                        if (nxt.hasClass('new_comment_form_wrapper')) {
                            var tree = $('#mptt-comments-tree');
                            if (tree.data('reversed')) {
                                tree.prepend(data);
                            } else {
                                tree.append(data);
                            }
                            if (xhrobject.status == 201) {
                                // the comment was created
                                var comment_count = $('#comment_count');
                                var toplevel_comment_count = $('#comment_toplevel_count');

                                nxt.replaceWith('<p>' + gettext("Your comment was posted.") + '</p>');
                                comment_count.text(parseInt(comment_count.text(), 10) + 1);
                                if (post_data.parent_pk !== "") {
                                    toplevel_comment_count.text(parseInt(toplevel_comment_count.text(), 10) + 1);
                                }
                            } else {
                                // the comment was posted but is awaiting moderation, we shouldn't update counts etc
                                nxt.replaceWith('<p>' + gettext("Your comment was posted, it is now awaiting moderation to be displayed.") + '</p>');
                            }
                        }
                        else {
                            update_replies_count(nxt);
                            nxt.replaceWith(data);
                        }
                    } else {
                        // we are pre-visualizing a comment
                        append_data_and_rebind_form(nxt, data);
                    }
                }
            }); // end ajax call
            return false;
        }); // end submit callback
    }

    $('a.comment_reply').live("click", function(e) {
        var parent = $(this).parents('.comment_outer');
        var nxt = parent.next('.comment_form_wrapper');

        if (!parent.length) {
            nxt = $('.new_comment_form_wrapper');
        }
        else if (!nxt.length) {
            nxt = $('<div class="comment_form_wrapper"></div>').insertAfter(parent);
            nxt.hide();
        }
        else {
            nxt.slideUp("slow");
        }
        
        $.ajax({
            type: 'GET',
            url: $(this).attr('href') + '?is_ajax=1',
            dataType: 'html',
            error: function(data, textStatus, xhrobject) {
                return ajax_error(nxt, data, textStatus);
            },
            success: function(data, textStatus, xhrobject) {
                append_data_and_rebind_form(nxt, data);
            }
        });
        return false;
    });

    $('a.comment_replies').live("click", function(e) { 
        var href = $(this).attr('href');
        var id = 'c' + (new RegExp("(\\d+)/$").exec(href)[1]);

        if (!is_in(replies_loaded, id)) {
            $.get($(this).attr('href') + '?is_ajax=1', {}, function(data, textStatus) {
                var comments_tree = data.comments_tree;
                if (comments_tree) {
                    $('#' + id).append(comments_tree.html);
                }
                replies_loaded.push(id);
            }, "json");
        }
        return false;
    });

    $('.comment_expand').live("click", function() {
        var href = $(this).attr('href');
        var id = 'c' + (new RegExp("(\\d+)/$").exec(href)[1]);
        var comment_el = $('#' + id);

        if (comment_el.hasClass('comment_collapsed')) {
            comment_el.removeClass('comment_collapsed');
            comment_el.addClass('comment_expanded');
        }
        else {
            comment_el.addClass('comment_collapsed');
            comment_el.removeClass('comment_expanded');
        }
        return false;
    });

    $('.comments_more').live("click", function() {
        $.get($(this).attr('href') + '?is_ajax=1', { }, function(data, textStatus) {
            var comments_for_update = data.comments_for_update;
            var tid = data.tid;
            var more = $('#c' + tid + ' .comments_more');
            var morep = more.parent();
            var comments_tree = data.comments_tree;
            var remaining_count = data.remaining_count;
            var update_len = 0;

            if (comments_for_update) {
                update_len = comments_for_update.length;
                for (var c = 0; c < update_len; c++) {
                    var comment = comments_for_update[c];
                    if ("parent" in comment) {
                        if (comment.parent == tid && morep) {
                            morep.before(comment.html);
                        }
                        else {
                            $('#c' + comment.parent).append(comment.html);
                        }
                    }
                }
            }

            if (comments_tree) {
                $('#mptt-comments-tree').append(comments_tree.html);
            }

            if (remaining_count > 0) {
                var old_href = more.attr('href');
                var last_comment_pk;

                $('#c' + tid + ' .comments_more_remaining').html(remaining_count);
                if (update_len) {
                    last_comment_pk = comments_for_update[update_len - 1].pk;
                }
                else {
                    last_comment_pk = comments_tree.end_pk;
                }

                more.attr('href', old_href.replace(new RegExp("\\d+/$"), last_comment_pk + '/'));
            }
            else {
                morep.hide();
            }

        }, "json");
        return false;
    });

    $('.new_comment_form_wrapper').each(function() {
        var nxt = $(this);
        var frm = $('form', nxt);

        bind_submit(frm, nxt);
    });
});
