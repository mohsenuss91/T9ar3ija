var NotesApp = (function(){
  var debug = true;
  
  function fuzzCoords(coords){
    coords.latitude += (Math.random() - 0.5) * 0.1;
    coords.longitude += (Math.random() - 0.5) * 0.1;
  }
  
  
  var App = {
    stores: {},
    views: {},
    collections: {}
  }
  
  // Initialize localStorage Data Store
  App.stores.notes = new Store('notes');
  
  
  // Note Model
  var Note = Backbone.Model.extend({
    // Use localStorage datastore
    localStorage: App.stores.notes,
    
    initialize: function(){
      if(!this.get('title')){
        this.set({title: "Note @ " + Date() })
      };
      
      if(!this.get('body')){
        this.set({body: "No Content"})
      };
    },
    
    // Returns true if the Note is tagged with location data
    isGeoTagged: function(){
      return this.get('latitude') && this.get('longitude');
    },
    
    // Creates a url for a map pinned with this Note's location
    mapImageUrl: function(options){
      // Using Google Static Maps API
      // docs: http://code.google.com/apis/maps/documentation/staticmaps/
      
      var base = "http://maps.google.com/maps/api/staticmap?"
      var defaults = {
        zoom: 14,
        height: 500,
        width: 500,
        maptype: 'roadmap',
        sensor: 'false'
      }
      
      // Update options with defaults
      options = _.extend(defaults, options);
      
      // Convert {width:400, height:300} to {size: "400x300"}
      options.size = options.width + "x" + options.height;
      delete options.height;
      delete options.width;
      
      // Add markers to parameters to add a blue pin to the map
      var latlon = this.get('latitude') + "," + this.get('longitude');
      options.markers = "color:blue|label:X|" + latlon;
      
      // Center on this Note's location
      options.center = latlon;
      
      var url = base + $.param(options);
      return url;
    },
    
    distanceFromCurrent: function(){
      if(!this.isGeoTagged() || !App.currentLocation){
        return -1;
      }
      
      // Convert Degrees to Radians
      function toRad(n){
        return n * Math.PI / 180;
      }
    
    
      var lat1 = App.currentLocation.latitude,
          lat2 = this.get('latitude'),
          lon1 = App.currentLocation.longitude,
          lon2 = this.get('longitude');
  
      var R = 6371; // km
      var dLat = toRad(lat2-lat1);
      var dLon = toRad(lon2-lon1); 
      var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
              Math.sin(dLon/2) * Math.sin(dLon/2); 
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
      var d = R * c;
    
      return d;
    }
    
  })
  
  
  var NoteList = Backbone.Collection.extend({
    // This collection is composed of Note objects
    model: Note,
    
    // Set the localStorage datastore
    localStorage: App.stores.notes,
    
    initialize: function(){
      var collection = this;
      
      // When localStorage updates, fetch data from the store
      this.localStorage.bind('update', function(){
        collection.fetch();
      })
    }
    
  });
  
  var NearestPageView = Backbone.View.extend({
    events: {
      'click .locate': 'updateLocation'
    },
    
    initialize: function(options){
      this.listView = options.listView;
    },
    
    updateLocation: function(e){
      var pageView = this;
      
      if('geolocation' in navigator){
        navigator.geolocation.getCurrentPosition(function(position){
          if(position && position.coords){
            
            //Set Current Location
            App.currentLocation = position.coords
            pageView.listView.collection.sort();
          }
        })
      }
    }
  })
  
  
  // Views
  var NewFormView = Backbone.View.extend({
    events: {
      "submit form":  "createNote"
    },
        
    createNote: function(e){
      var attrs = this.getAttributes(),
          note = new Note();
       
      function create(){
        note.set(attrs);
        note.save();
        
        //Close
        $('.ui-dialog').dialog('close');
        this.reset();
      }
            
      if(attrs.locate == 'yes' && 'geolocation' in navigator){
        //Do geolocate
        navigator.geolocation.getCurrentPosition(function(position){
          // Handle Our Geolocation Results
          if(position && position.coords){
            attrs.latitude = position.coords.latitude;
            attrs.longitude = position.coords.longitude
          }
          
          if(debug){
            fuzzCoords(attrs);
          }
          
          create(); 
        })
      }else{
        create();
      }
          
                    
      // Stop browser from actually submitting the form (or following the link)
      e.preventDefault();
      // Stop jQuery Mobile from doing its form magic. We got this.
      e.stopPropagation();
    },
    
    getAttributes: function(){
      return {
        title: this.$('form [name="title"]').val(),
        body: this.$('form [name="body"]').val(),
        locate: this.$('form [name="locate"]').val()
      }
    },
    
    reset: function(){
      // Normal form.reset() would be ideal, but current causes
      // jQuery Mobile switches to fall out of sync
      this.$('input, textarea').val('');
    }
    
  });
  
  
  // Represents a listview page displaying a collection of Notes
  // Each item is represented by a NoteListItemView
  var NoteListView = Backbone.View.extend({
    
    initialize: function(){
      _.bindAll(this, 'addOne', 'addAll');
      
      this.collection.bind('add', this.addOne);
      this.collection.bind('refresh', this.addAll);
      
      this.collection.fetch();
    },
    
    addOne: function(note){
      var view = new NoteListItemView({model: note});
      $(this.el).append(view.render().el);
      
      if('mobile' in $){
        $(this.el).listview().listview('refresh');
      }
    },
    
    addAll: function(){
      $(this.el).empty();
      this.collection.each(this.addOne);
    }
    
    
  });
  
  var NoteListItemView = Backbone.View.extend({
    tagName: 'LI',
    template: _.template($('#note-list-item-template').html()),
    
    initialize: function(){
      _.bindAll(this, 'render')
      
      this.model.bind('change', this.render)
    },
    
    render: function(){
      $(this.el).html(this.template({ note: this.model }))
      return this;
    }
    
  })
  
  /* Container fore NoteDetailView
   *
   * Responsible for generating each NoteDetailView 
   */
  var NoteDetailList = Backbone.View.extend({
    // Render NoteDetailView[s] into this element
    el: $('#note-detail-list'),
  

    initialize: function(){
      // Make sure all functions execute with the correct 'this'
      _.bindAll(this, 'addOne', 'addAll', 'render');
    
    
      this.collection.bind('add', this.addOne);
      this.collection.bind('refresh', this.addAll);
    
      this.collection.fetch();
    },
  
    addOne: function(note){
      var view = new NoteDetailView({model: note});
      $(this.el).append(view.render().el);
      if($.mobile)
        $.mobile.initializePage();
    },
  
    addAll: function(){
      $(this.el).empty();
      this.collection.each(this.addOne);
    }
  });
  
  
  /**
  * Show Page
  */
  var NoteDetailView = Backbone.View.extend({
    // View based on a DIV tag
    tagName: "DIV",

  
    // Use a template to interpret vakues
    template: _.template($('#note-detail-template').html()),
  
  
    initialize: function(){
      // Make sure render is always called with this = this view
      _.bindAll(this, 'render');
    
      // Updated this div with jQuery Mobile data-role, and unique ID
      $(this.el).attr({
        'data-role': 'page',
        'id': "note_" + this.model.id
      });
    
      // Whenever the model changes, render this view
      this.model.bind('change', this.render);
    },
  
    // Render the view into this View's element
    render: function(){
      $(this.el).html(this.template({note: this.model}));
      return this;
    },

  });
  
    
  
  
  
  window.Note = Note;
  
  App.collections.all_notes = new NoteList(null, {
    comparator: function(note){
      return (note.get('title') || "").toLowerCase();
    }
  });
  
  App.collections.notes_distance = new NoteList(null, {
    comparator: function(note){
      return note.distanceFromCurrent();
    }
  })
  
  App.views.new_form = new NewFormView({
    el: $('#new')
  });
  
  App.views.list_alphabetical = new NoteListView({
    el: $('#all_notes'),
    collection: App.collections.all_notes
  });
  
  // Initialize View for collection of all Note Detail pages
  App.views.notes = new NoteDetailList({
    collection: App.collections.all_notes
  });
  
  // Initialize View for distance sorted listview of Notes
  App.views.list_distance = new NoteListView({
    el: $('#nearest_notes'),
    collection: App.collections.notes_distance
  })
  
  
  // Initialize  the Nearest Page View
  App.views.nearest_page = new NearestPageView({
    el: $('#nearest'),
    listView: App.views.list_distance
  })

  
  
  
  
  
  
  return App;
})();




