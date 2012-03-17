/*
 * Module Javascript
 * Implements a YUI3 Module in the Moodle namespace
 * In this file is present all the javascript code needed for building the ui and subplugins system
 * 
 */

M.block_jmail = {};

M.block_jmail.Y = null;
M.block_jmail.app = {};
M.block_jmail.labels = [];
M.block_jmail.newemailOpen = false;
M.block_jmail.messageCache = {};
// keeps user filter current state
M.block_jmail.filterUser = {firstname: '', lastname: '', group: 0, role: 0}
// keeps message filter current state
M.block_jmail.filterMessage = {label: 'inbox', start: 0, sort: 'date', direction: 'DESC', searchtext: ''};
M.block_jmail.currentLabel = 0;
M.block_jmail.searchTimeout = null;
M.block_jmail.searchText = '';

M.block_jmail.init = function(Y, cfg) {
    
    M.block_jmail.Y = Y;
    M.block_jmail.cfg = cfg;
    
    
    // First of all, load labels (async request)
    M.block_jmail.loadLabels();
    
    // Load all the contacts users
    M.block_jmail.loadContacts();
    
    // Old Yui2 shortcuts 
    var Dom = YAHOO.util.Dom, Event = YAHOO.util.Event;
    
    // Sets the page height
    Y.one('#jmailui').setStyle('height', Y.one('document').get('winHeight')+'px');

    // Load the main layouts
    var layout = new YAHOO.widget.Layout('jmailui', {
        units: [            
            { position: 'right', width: 300, resize: false, scroll: true, body: 'jmailright', animate: true, gutter: '2px'},            
            { position: 'left', width: 200, resize: false, body: 'jmailleft', scroll: true, animate: true, gutter: '2px' },
            { position: 'center', body: 'jmailcenter' }
        ]
    });
    
    var layout2 = null;
    var layout3 = null;
    layout.on('render', function() {
        var el = layout.getUnitByPosition('center').get('wrap');
        layout2 = new YAHOO.widget.Layout(el, {
            parent: layout,
            units: [
                { position: 'top', body: 'mailarea', height: 300, gutter: '2px', resize: true },                
                { position: 'center', body: 'mailcontents', gutter: '2px'}
            ]
        });
        layout2.render();
        
        el = layout.getUnitByPosition('right').get('wrap');
        layout3 = new YAHOO.widget.Layout(el, {
            parent: layout,
            units: [
                { position: 'top', body: 'contact_list_filter', height: 200, gutter: '2px', resize: true },                
                { position: 'center', body: 'contact_list_users', gutter: '2px', scroll: true}
            ]
        });
        layout3.render();
    });
    
    layout.render();    
    //layout.getUnitByPosition('right').collapse();
    
    M.block_jmail.app.layout = layout;
    M.block_jmail.app.layout2 = layout2;
    M.block_jmail.app.layout3 = layout3;
    
    // New and check mail buttons
    var icon = document.createElement('span'); 
    icon.className = 'icon';
    var newmailButton = new YAHOO.widget.Button("newmail");
    newmailButton.appendChild(icon);
    
    var icon = document.createElement('span'); 
    icon.className = 'icon';
    var checkmailButton = new YAHOO.widget.Button("checkmail");
    checkmailButton.appendChild(icon);
    Y.one('#checkmail').on('click', function(e){
            M.block_jmail.checkMail('inbox', '');
        });
    
    Y.one("#newmail").on('click', function(e){
            M.block_jmail.composeMessage();           
        });
    
    // INBOX Toolbar    
    var icon = document.createElement('span'); 
    icon.className = 'icon';    
    var deleteButton = new YAHOO.widget.Button("deleteb");
    deleteButton.appendChild(icon);
    deleteButton.on("click", M.block_jmail.deleteMessage);
    
    var icon = document.createElement('span'); 
    icon.className = 'icon';
    var replyButton = new YAHOO.widget.Button("replyb");
    replyButton.appendChild(icon);
    //replyButton.on("click", M.block_jmail.replyMessage());
    
    var icon = document.createElement('span'); 
    icon.className = 'icon';
    var forwardButton = new YAHOO.widget.Button("forwardb");
    forwardButton.appendChild(icon);
    //forwardButton.on("click", M.block_jmail.forwardMessage());
    
    var icon = document.createElement('span'); 
    icon.className = 'icon';
    var moveButton = new YAHOO.widget.Button("moveb", {type: "menu", menu: "labelsmenu"});
    moveButton.appendChild(icon);
    //moveButton.on("click", M.block_jmail.moveMessage());
    
    var icon = document.createElement('span'); 
    icon.className = 'icon';
    var printButton = new YAHOO.widget.Button("printb");
    printButton.appendChild(icon);
    //printButton.on("click", M.block_jmail.printMessage());
    
    //var checkmailButton = new YAHOO.widget.Button("checkmail");
    
    // Group and role filter buttons
    var rolesselectorB = new YAHOO.widget.Button("rolesselectorb", {type: "menu",
                                                 menu: "rolesselector",
                                                 onclick: {fn: function(p_sType, p_aArgs, p_oItem) {
                                                    console.log(p_oItem);
                                                            var sText = p_oItem.cfg.getProperty("text");
                                                            
                                                            rolesselectorB.set("label", sText);
                                                            console.log(sText);
                                                            }
                                                            }
                                                        });
    
    var groupselectorB = new YAHOO.widget.Button("groupselectorb", {type: "menu", menu: "groupselector"});

    
    // Mail list table
    
    var url = 'block_jmail_ajax.php?id='+cfg.courseid+'&action=get_message_headers&sesskey='+cfg.sesskey;
    
    generateRequest = null;
    
    var initDataTable = function(h, w) {        
        //Create the Column Definitions
        var myColumnDefs = [
            {key:'', formatter:YAHOO.widget.DataTable.formatCheckbox, width: 10 },
            {key:"from", 'label' : M.str.block_jmail.from, sortable:true, width: 125 },
            {key:"subject", 'label' : M.str.block_jmail.subject, sortable:true, width: (w - 350) },
            {key:"date", 'label' : M.str.block_jmail.date,formatter:YAHOO.widget.DataTable.formatDate, sortable:true, width: 150 }
        ];
        //Create the datasource       
        
        // DataSource instance
        var myDataSource = new YAHOO.util.DataSource(url);
        myDataSource.responseType = YAHOO.util.DataSource.TYPE_JSON;
        myDataSource.responseSchema = {
            resultsList: "messages",
            fields: ["id","from","subject","date"],
            // Access to values in the server response
            metaFields: {
                totalRecords: "total",
                startIndex: "start"
            }
        };
        
        // Customize request sent to server to be able to set total # of records
        generateRequest = function(oState, oSelf) {
            // Get states or use defaults
            oState = oState || { pagination: null, sortedBy: null };
            var sort = (oState.sortedBy) ? oState.sortedBy.key : M.block_jmail.filterMessage.sort;
            var dir = (oState.sortedBy && oState.sortedBy.dir === YAHOO.widget.DataTable.CLASS_ASC) ? "ASC" : M.block_jmail.filterMessage.direction;
            var startIndex = (oState.pagination) ? oState.pagination.recordOffset : M.block_jmail.filterMessage.start;
            var results = (oState.pagination) ? oState.pagination.rowsPerPage : cfg.pagesize;
   
            // Build custom request
            return  "&sort=" + sort +
                    "&direction=" + dir +
                    "&start=" + startIndex +
                    "&label=" + M.block_jmail.filterMessage.label +                    
                    "&searchtext=" + M.block_jmail.filterMessage.searchtext
                    ;
        };        

        //Create the DT, setting scrollable to true and setting the height
        YAHOO.widget.DataTable.MSG_EMPTY = 'This folder contains no messages';

        // DataTable configuration
        var myConfigs = {
            generateRequest: generateRequest,
            initialRequest: generateRequest(), // Initial request for first page of data
            dynamicData: true, // Enables dynamic server-driven data
            paginator: new YAHOO.widget.Paginator({ rowsPerPage:25 }), // Enables pagination
            scrollable: true,
            height: h + 'px', width: w + 'px'
        };

        dataTable = new YAHOO.widget.DataTable("maillist", myColumnDefs, myDataSource, myConfigs);
        
        // Subscribe to events for row selection
        dataTable.subscribe("rowMouseoverEvent", dataTable.onEventHighlightRow);
        dataTable.subscribe("rowMouseoutEvent", dataTable.onEventUnhighlightRow);
        dataTable.subscribe("rowClickEvent", dataTable.onEventSelectRow);
        dataTable.subscribe("rowSelectEvent", function() {
            
            Y.one('#mailcontents').setContent('<div class = "loading_big"></div>');
            
            // First row for displaying the first mail
            var data = this.getRecordSet().getRecord(this.getSelectedRows()[0])._oData;
            
            M.block_jmail.loadMessage(data.id);
            // All rows selected
            //console.log(this.getSelectedRows());
            
        }, dataTable, true);
        
        dataTable.doBeforeLoadData = function(oRequest, oResponse, oPayload) {
            oPayload.totalRecords = oResponse.meta.total;
            oPayload.pagination.recordOffset = oResponse.meta.start;
            return oPayload;
        };
        M.block_jmail.app.dataTable = dataTable;
        M.block_jmail.app.dataSource = myDataSource;
    };
    initDataTable(layout2.getSizes().top.h, layout2.getSizes().top.w);
    
    
    // Alphabet filter    
   
    Y.all('#firstnamefilter .alphabet').on('click', function(e){
            Y.all('#firstnamefilter a').setStyle('font-weight', 'normal');
            e.target.setStyle('font-weight', 'bold');            
            M.block_jmail.filterUser.firstname = e.target.get('text');
            M.block_jmail.loadContacts();
            // Stop the event's default behavior
            e.preventDefault();
        });
    Y.all('#lastnamefilter .alphabet').on('click', function(e){
            Y.all('#lastnamefilter a').setStyle('font-weight', 'normal');
            e.target.setStyle('font-weight', 'bold');            
            M.block_jmail.filterUser.lastname = e.target.get('text');
            M.block_jmail.loadContacts();
            // Stop the event's default behavior
            e.preventDefault();
        });
    Y.all('#firstnamefilter .alphabetreset').on('click', function(e){
            Y.all('#firstnamefilter a').setStyle('font-weight', 'normal');
            e.target.setStyle('font-weight', 'bold');
            M.block_jmail.filterUser.firstname = '';
            M.block_jmail.loadContacts();
            // Stop the event's default behavior
            e.preventDefault();
        });
    Y.all('#lastnamefilter .alphabetreset').on('click', function(e){
            Y.all('#lastnamefilter a').setStyle('font-weight', 'normal');
            e.target.setStyle('font-weight', 'bold');
            M.block_jmail.filterUser.lastname = '';
            M.block_jmail.loadContacts();
            // Stop the event's default behavior
            e.preventDefault();
        });
    
    // Labels
    Y.one('#addlabel').on('click', function(){
            M.block_jmail.addLabel();
        });
    
    // Build the labels action menu
    // TODO - Add rename options
    
    var labelsMenu = new YAHOO.widget.Menu("basicmenu");
    labelsMenu.addItems([

        { text: "&nbsp;&nbsp;"+M.str.moodle.delete, onclick: { fn: M.block_jmail.deleteLabel } }

    ]);
    labelsMenu.render("menulabel");
    M.block_jmail.app.labelsMenu = labelsMenu;
    
    
    // Actions for fixed labels inbox, draft, bin
    
    Y.all('#label_list a').on('click', function(e){        
        M.block_jmail.checkMail(e.target.get('id'), '');
    });
    
    // Search
    
    Y.one('#input_search').on('keyup', function(e){
        M.block_jmail.searchText = Y.Lang.trim(this.get('value'));
        if (M.block_jmail.searchText.length >= 3) {
            clearTimeout(M.block_jmail.searchTimeout);
            setTimeout(function() { M.block_jmail.checkMail('search', M.block_jmail.searchText) }, 600);
        } else if (M.block_jmail.searchText.length == 0) {
            M.block_jmail.checkMail('inbox', '');
        }
     });

    // Compose email fields
    
    // Autocomplete
    
    var cfg = {
        resultHighlighter: 'phraseMatch',
        minQueryLength: 2,
        resultTextLocator: 'fullname',        
        source: 'block_jmail_ajax.php?id='+cfg.courseid+'&action=get_contacts_search&sesskey='+cfg.sesskey+'&search={query}'
    };
    
    cfg.on = {
            select: function(e) {
                var hidden = Y.one('#hiddento');
                var raw = e.details[0].result.raw;
                
                if(Y.Array.indexOf(raw.id, hidden.get('value').split(',')) !== false) {
                    hidden.set('value', hidden.get('value') + raw.id + ',');
                    Y.one('#composetolist').append('<span id="" class="destinatary">'+raw.fullname+'</span>');
                    setTimeout(function() { Y.one('#composetoac').set('value', ''); }, 100);
                }
            }};
        
    Y.one('#composetoac').plug(Y.Plugin.AutoComplete, cfg);
    Y.one('#composeccac').plug(Y.Plugin.AutoComplete, cfg);
    Y.one('#composebccac').plug(Y.Plugin.AutoComplete, cfg);
    
    
    
}

M.block_jmail.deleteLabel = function(p_sType, p_aArgs, p_oValue) {
    var cfg = M.block_jmail.cfg;
    var Y = M.block_jmail.Y;    
    var url = 'block_jmail_ajax.php?id='+cfg.courseid+'&action=delete_label&sesskey='+cfg.sesskey+'&labelid='+M.block_jmail.currentLabel;
    Y.io(url);    
    M.block_jmail.loadLabels();    
}

M.block_jmail.checkMail = function(label, searchtext) {
    M.block_jmail.filterMessage = {
            label: label,
            start: 0,
            sort: 'date',
            direction: 'DESC',
            searchtext: searchtext
        };
        
    if (searchtext) {
        M.block_jmail.searchTimeout = null;
    }
    
    M.block_jmail.app.dataSource.sendRequest(generateRequest(), {
        success : M.block_jmail.app.dataTable.onDataReturnSetRows,
        failure : M.block_jmail.app.dataTable.onDataReturnSetRows,
        scope : M.block_jmail.app.dataTable,
        argument: M.block_jmail.app.dataTable.getState() // data payload that will be returned to the callback function
    }); 
}

// Main function for loading the contact list based on filters

M.block_jmail.loadContacts = function() {
    var cfg = M.block_jmail.cfg;
    var Y = M.block_jmail.Y;
    
    var params = '';
    params += '&fi='+M.block_jmail.filterUser.firstname;
    params += '&li='+M.block_jmail.filterUser.lastname;
    params += '&group='+M.block_jmail.filterUser.group;
    params += '&roleid='+M.block_jmail.filterUser.role;
    
    var actionButtons = '<br />';
    var buttonTypes = {to: 'for', cc: 'cc', bcc: 'bcc'};
    for (var el in buttonTypes) {
        actionButtons += '<input type="button" class="b'+el+'" value="'+M.str.block_jmail[buttonTypes[el]]+'">&nbsp;';
    }
    
    var url = 'block_jmail_ajax.php?id='+cfg.courseid+'&action=get_contacts&sesskey='+cfg.sesskey+params;
    var cfg = {
        on: {
            complete: function(id, o, args) {
                    var contactsHtml = '';
                    
                    contacts = Y.JSON.parse(o.responseText);
                    
                    var cssclass = 'jmail-odd';
                    
                    for(var el in contacts) {
                        cssclass = (cssclass == 'jmail-even') ? 'jmail-odd': 'jmail-even';
                        var imageHtml = contacts[el].profileimage;
                        contactsHtml += '<div id="user'+contacts[el].id+'" class="'+cssclass+'">';
                        contactsHtml += ' <div class="profileimage">'+imageHtml+'</div>';
                        contactsHtml += ' <div class="fullname">'+contacts[el].fullname+actionButtons+'</div>';                        
                        contactsHtml += '</div>';;
                    }
                    
                    var cList = Y.one('#contact_list_users');
                    cList.set('text','');
                    cList.append(contactsHtml);
                    
                    Y.all('#contact_list_users input').on('click', function(e){
                        var userid = e.target.ancestor('div').ancestor('div').get('id').replace('user');
                        // Detect to, cc or bcc - e.target.hasClass();
                        M.block_jmail.composeMessage();
                    });
            }
        }
    };
    Y.io(url, cfg);
}

M.block_jmail.loadMessage = function(messageId) {
    var cfg = M.block_jmail.cfg;
    var Y = M.block_jmail.Y;
    
    var url = 'block_jmail_ajax.php?id='+cfg.courseid+'&action=get_message&sesskey='+cfg.sesskey+'&messageid='+messageId;
    var cfg = {
        on: {
            complete: function(id, o, args) {
                                       
                    var message = Y.JSON.parse(o.responseText);
                    console.log(message);
                    
                    if (typeof message.error === 'undefined') {
                        var messageHtml = '<div id="mail_header"> \
                                      <div class="mail_from"><div class="mail_el">'+M.str.block_jmail.from+': </div><span>'+message.from+'</span></div> \
                                      <div class="mail_subject"><div class="mail_el">'+M.str.block_jmail.subject+': </div><span>'+message.subject+'</span></div>';
                        
                        // Destinataries
                        var lang = {to : M.str.block_jmail.for, cc: M.str.block_jmail.cc, bcc: M.str.block_jmail.bcc};

                        for (var el in message.destinataries) {
                            var dest = message.destinataries[el];
                            messageHtml += '<div class="mail_destinatary"><div class="mail_el">'+lang[dest.type]+': </div><span>'+dest.fullname+'</span></div>';
                        }
                                                
                        messageHtml +=    '</div> \
                                      <div id="mail_contents"> \
                                      '+message.body+'\
                                      </div> \
                                      ';
                        
                        Y.one('#mailcontents').setContent(messageHtml);
                    }
            }
        }
    };
    Y.io(url, cfg);
}

M.block_jmail.addLabel = function() {
    var Y = M.block_jmail.Y;
    var cfg = M.block_jmail.cfg;
    
    if (typeof M.block_jmail.app.panel == 'undefined') {
        var panel = new Y.Panel({
            srcNode      : '#newlabelpanel',
            headerContent: M.str.block_jmail.addlabel,
            width        : 250,
            zIndex       : 5,
            centered     : true,
            modal        : true,
            visible      : false,
            render       : true,
            plugins      : [Y.Plugin.Drag]
        });
        M.block_jmail.app.panel = panel;
        
        M.block_jmail.app.panel.addButton({
            value  : M.str.moodle.add,
            section: Y.WidgetStdMod.FOOTER,
            action : function (e) {
                
                var name = Y.one('#newlabelname').get('value');
                var url = 'block_jmail_ajax.php?id='+cfg.courseid+'&action=create_label&sesskey='+cfg.sesskey+'&name='+name;
                Y.io(url);
                M.block_jmail.app.panel.hide();
                M.block_jmail.loadLabels();
                e.preventDefault();
            }
        });
    }

    M.block_jmail.app.panel.show();
}

M.block_jmail.loadLabels = function() {
    var cfg = M.block_jmail.cfg;
    var Y = M.block_jmail.Y;
    
    var url = 'block_jmail_ajax.php?id='+cfg.courseid+'&action=get_labels&sesskey='+cfg.sesskey;
    var cfg = {
        on: {
            complete: function(id, o, args) {
                    
                    // Load left block
                    var labels = Y.JSON.parse(o.responseText);
                    
                    if (typeof labels.error != 'undefined') {
                        M.block_jmail.displayError(labels);
                        return false;
                    }
                    
                    M.block_jmail.labels = labels;
                    var labelsHtml = '';
                    
                    for(var el in labels) {
                        var l = labels[el];
                        labelsHtml += '<li class="folder"><em></em><a href="#" id="label'+l.id+'">'+l.name+'</a><span class="labelactions" style="visibility: hidden"><img id="labelactions'+l.id+'" src="pix/menu.png"></span></li>';
                    }
                    
                    var cList = Y.one('#user_labels');
                    cList.set('text','');
                    cList.append('<ul>'+labelsHtml+'</ul>');
                    
                    Y.all("#user_labels li").on('mouseover', function(e){                                                
                        //Y.all("#user_labels li .labelactions").setStyle('visibility', 'hidden');
                        if (e.target.one('.labelactions'))
                            e.target.one('.labelactions').setStyle('visibility', 'visible'); 
                    });
                    
                    Y.all('#user_labels a').on('click', function(e){        
                        M.block_jmail.checkMail(e.target.get('id').replace("label",""), '');
                    });
                                       
                    Y.all("#user_labels img").on('click', function(e){
                            Y.all("#user_labels li .labelactions").setStyle('visibility', 'hidden');
                            M.block_jmail.app.labelsMenu.cfg.setProperty('context', [e.target.get('id'),'tr','tr']);
                            M.block_jmail.app.labelsMenu.cfg.setProperty('visible', true);
                            M.block_jmail.app.labelsMenu.cfg.setProperty('zindex', 70);
                            M.block_jmail.currentLabel = e.target.get('id').replace("labelactions","");
                        });
                    
                    // TODO Load move button labels
            }
        }
    };
    Y.io(url, cfg);
}


// This is for execute the Javascript returned in an AJAX response
M.block_jmail.doJS = function(e){
    
    var Reg = '(?:<script.*?>)((\n|.)*?)(?:</script>)';
    var match    = new RegExp(Reg, 'img');
    var scripts  = e.innerHTML.match(match);
    var doc = document.write;
    document.write = function(p){ e.innerHTML = e.innerHTML.replace(scripts[s],p)};
    if(scripts) {
        for(var s = 0; s < scripts.length; s++) {
            var js = '';
            var match = new RegExp(Reg, 'im');
            js = scripts[s].match(match)[1];
            js = js.replace('<!--','');
            js = js.replace('-->','');
            eval('try{'+js+'}catch(e){}');
        }
    }
    document.write = doc;
};


M.block_jmail.loadEditor = function(callback){
    console.log(M.block_jmail.Y);
    callback(M.block_jmail.Y);
}

M.block_jmail.deleteMessage = function() {
    M.block_jmail.confirmDialog(M.str.block_jmail.confirmdelete, M.block_jmail.deleteMessageConfirm);
}

M.block_jmail.deleteMessageConfirm = function() {
    var cfg = M.block_jmail.cfg;
    var Y = M.block_jmail.Y;

    var messageids = '';
    var messages = M.block_jmail.app.dataTable.getSelectedRows();
    for (var el in messages) {
        messageids += M.block_jmail.app.dataTable.getRecordSet().getRecord(messages[el])._oData.id + ',';
    }
    
    var url = 'block_jmail_ajax.php?id='+cfg.courseid+'&action=delete_message&sesskey='+cfg.sesskey+'&messageids='+messageids;
    var cfg = {
        on: {
            complete: function(id, o, args) {                  
                M.block_jmail.checkMail(M.block_jmail.filterMessage.label, M.block_jmail.filterMessage.searchtext);
            }
        }
    };
    Y.io(url, cfg);
    
    
}

M.block_jmail.composeMessage = function() {
    var cfg = M.block_jmail.cfg;
    var Y = M.block_jmail.Y;
    
    if (M.block_jmail.newemailOpen) {
        return;
    }
            
    M.block_jmail.newemailOpen = true;
    
    Y.one('#newemailpanel').setStyle('display', 'block');
    var panel = new YAHOO.widget.Panel("newemailpanel", {
        draggable: true,
        width: "600px",
        height: "400px",
        autofillheight: "body",
        top: "100px"
    });
    
    panel.subscribe("hide", function (event) {
        M.block_jmail.newemailOpen = false;
        Y.one('#newemailform').setContent('');
    });
    panel.render();     
}

M.block_jmail.confirmDialog = function(msg, callBack) {     
	var dialog = new YAHOO.widget.SimpleDialog("simpledialog", 
			 { width: "300px",
			   fixedcenter: true,
			   visible: false,
			   draggable: false,
			   close: true,
			   text: msg,
			   icon: YAHOO.widget.SimpleDialog.ICON_HELP,
			   constraintoviewport: true,
			   buttons: [ { text:"Yes", handler: function() { this.hide(); callBack();} , isDefault:true },
						  { text:"No",  handler: function(){ this.hide(); } } ]
			 } );    
    dialog.render("maillist");    
    dialog.show();
}